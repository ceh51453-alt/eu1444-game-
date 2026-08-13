/**
 * Chuyển hai World Info người dùng cung cấp và sinh 35 sách chuyên biệt chủng tộc.
 * Chạy: node tools/tich-hop-lore-trung-co.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const ROOT = join(TOOLS, '..');
const DOWNLOADS = join(process.env.USERPROFILE ?? 'C:\\Users\\LOC', 'Downloads');
const TRADE_SOURCE = join(DOWNLOADS, '[Trung Cổ] Thương Mại & Ẩm Thực.json');
const WORLD_SOURCE = join(DOWNLOADS, '[Trung Cổ] Thế Giới Quan.json');
const OUT = join(ROOT, 'lorebooks');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const values = (worldInfo) => Object.values(worldInfo.entries ?? {})
  .filter((entry) => entry !== null && typeof entry === 'object' && String(entry.content ?? '').trim() !== '');

function slug(text) {
  return String(text)
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function unique(items) {
  return [...new Set(items.map((item) => String(item).trim()).filter(Boolean))];
}

function clean(text) {
  return String(text)
    .replace(/<\/?[^>]+>/g, '')
    .replace(/^\s*[a-z_][a-z0-9_]*:\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function chunks(text, max = 4700) {
  const paragraphs = clean(text).split(/\n\s*\n/);
  const out = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (current !== '' && current.length + paragraph.length + 2 > max) {
      out.push(current);
      current = '';
    }
    if (paragraph.length <= max) {
      current += `${current === '' ? '' : '\n\n'}${paragraph}`;
      continue;
    }
    for (let at = 0; at < paragraph.length; at += max) {
      if (current !== '') out.push(current);
      out.push(paragraph.slice(at, at + max));
      current = '';
    }
  }
  if (current !== '') out.push(current);
  return out;
}

function headings(text) {
  return unique(String(text).split('\n')
    .map((line) => line.trim().replace(/^[-#]+\s*/, '').replace(/:\s*\|?$/, ''))
    .filter((line) => line.length >= 3 && line.length <= 75 && !/[.!?]$/.test(line)))
    .slice(0, 18);
}

function summary(text, max = 560) {
  const value = clean(text).replace(/\s+/g, ' ');
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return `${(stop > max / 2 ? cut.slice(0, stop + 1) : cut).trim()}…`;
}

function bundle(books) {
  return { kind: 'eu1444-lorebook', schemaVersion: 1, exportedAt: 0, books };
}

function baseEntry({ id, title, content, keys, embedding, summaryText, priority = 7, weight = 10, knowledge = 'public' }) {
  return {
    id, title, type: 'concept', content, summary: summaryText,
    keys: unique(keys), matchMode: 'wholeWord', caseSensitive: false, constant: false,
    embedding: { text: embedding, threshold: 0.17 },
    knowledge, placement: 'block', role: 'system', weight, budgetPriority: priority,
    recurse: false, preventRecursion: false, triggerOnce: false,
  };
}

// -------------------------------------------------------------------------
// 1. Thương mại & ẩm thực: chia entry khổng lồ thành các mảnh truy hồi được.
// -------------------------------------------------------------------------
const tradeSource = readJson(TRADE_SOURCE);
const tradeEntries = [];
for (const raw of values(tradeSource)) {
  const title = String(raw.comment ?? 'Tri thức kinh tế Trung Cổ').replace(/^Thế giới quan\s*-\s*/i, '');
  const parts = chunks(raw.content);
  parts.forEach((part, index) => {
    const partHeads = headings(part);
    const partTitle = parts.length === 1 ? title : `${title} · phần ${index + 1}`;
    const seasonal = "<% const mua = [12,1,2].includes(now.month) ? 'mùa đông' : [3,4,5].includes(now.month) ? 'mùa xuân' : [6,7,8].includes(now.month) ? 'mùa hạ' : 'mùa thu'; %>";
    const header = `${seasonal}\n[Niên đại <%= now.year %>, <%= mua %>] Canon Europa 1444 và số liệu trong game thắng nếu đoạn tham khảo dưới đây khác chúng.`;
    tradeEntries.push(baseEntry({
      id: `medtrade_${slug(title)}-${index + 1}`,
      title: partTitle,
      content: `${header}\n\n${part}`,
      summaryText: summary(part),
      keys: [...(raw.key ?? []), ...partHeads],
      embedding: `${title}. ${partHeads.join('. ')}. ${summary(part, 1100)}`,
      priority: 8,
      weight: 12,
    }));
  });
}

const tradeBook = {
  id: 'book-trung-co-thuong-mai-am-thuc',
  name: 'Europa 1444 · Thương mại, tiền tệ, ẩm thực và giấy thông hành',
  version: 1, scope: { kind: 'global' }, enabled: true, autoScope: false, priority: 2,
  entries: tradeEntries,
};
writeFileSync(join(OUT, '76-thuong-mai-am-thuc.json'), `${JSON.stringify(bundle([tradeBook]), null, 2)}\n`);

// -------------------------------------------------------------------------
// 2. Thế giới quan: giữ đủ entry, chia thành sách cơ chế và bọc EJS chống lộ
//    tên lý thuyết hoặc vật hiện đại vào lời kể năm 1444.
// -------------------------------------------------------------------------
const worldSource = readJson(WORLD_SOURCE);
const categoryBooks = new Map();
for (const [index, raw] of values(worldSource).entries()) {
  const comment = String(raw.comment ?? `Cơ chế suy luận ${index + 1}`).trim();
  const tag = /^\[([^\]]+)\]/.exec(comment)?.[1] ?? 'KHÁC';
  const category = tag.split(':')[0].split('+')[0].trim() || 'KHÁC';
  const list = categoryBooks.get(category) ?? [];
  const title = comment.replace(/^\[[^\]]+\]\s*/, '').trim() || `Cơ chế suy luận ${index + 1}`;
  const body = clean(raw.content);
  const guard = "<% const nam = now.year; %>\n[QUY TẮC SUY LUẬN HẬU TRƯỜNG · <%= nam %>] Chỉ lấy quan hệ nhân quả phù hợp xã hội phong kiến–ma pháp Europa. Không nêu tên tác giả, học thuyết, thuật ngữ hàn lâm hiện đại, kỹ nghệ tương lai hoặc thế giới ngoài canon trong lời kể.";
  list.push(baseEntry({
    id: `worldlogic_${slug(category)}-${String(raw.uid ?? index).padStart(3, '0')}`,
    title,
    content: `${guard}\n\n${body}`,
    summaryText: summary(body, 480),
    keys: [...(raw.key ?? []), ...headings(body).slice(0, 10)],
    embedding: `${title}. ${(raw.key ?? []).join('. ')}. ${summary(body, 900)}`,
    priority: category === 'CORE' ? 9 : 6,
    weight: category === 'CORE' ? 13 : 8,
    knowledge: 'secret',
  }));
  categoryBooks.set(category, list);
}

const worldBooks = [...categoryBooks.entries()].map(([category, entries]) => ({
  id: `book-the-gioi-quan-${slug(category)}`,
  name: `Europa 1444 · Suy luận hậu trường · ${category}`,
  version: 1, scope: { kind: 'global' }, enabled: true, autoScope: false, priority: 1, entries,
}));
writeFileSync(join(OUT, '77-the-gioi-quan-suy-luan.json'), `${JSON.stringify(bundle(worldBooks), null, 2)}\n`);

// -------------------------------------------------------------------------
// 3. Một sách auto-scope cho MỖI chủng tộc trong data/races.json.
// -------------------------------------------------------------------------
const races = readJson(join(ROOT, 'data', 'races.json')).races;
const profiles = readJson(join(TOOLS, 'chung-toc-canon.json')).profiles;
const mainRaceBooks = [
  readJson(join(OUT, '30-chung-toc.json')),
  readJson(join(OUT, '35-nhan-loai-bon-nhanh.json')),
  readJson(join(OUT, '75-huyet-toc-carpathian.json')),
];
const mainEntries = new Map(mainRaceBooks.flatMap((file) => file.books.flatMap((book) => book.entries)).map((entry) => [entry.id, entry]));

function list(items) {
  return unique(items ?? []).join(', ') || 'không có một quê hương duy nhất';
}

const raceBooks = races.map((race) => {
  const profile = profiles[race.id];
  const main = mainEntries.get(race.loreEntry);
  const shape = race.appearance;
  const ejs = `<% const noiToc = state.character && state.character.identity && state.character.identity.race === '${race.id}'; %><% if (noiToc) { %>[Góc nhìn nội tộc]<% } else { %>[Góc nhìn ngoại tộc — tránh biến định kiến thành sự thật]<% } %>`;
  const common = {
    race: race.name,
    keys: unique([race.name, race.englishName, ...(race.aliases ?? []), ...(profile?.keys ?? [])]),
  };
  const form = `Tuổi thọ điển hình: ${race.lifespan ?? 'chưa xác định'} năm. Chiều cao: ${shape?.heightCm?.join('–') ?? 'không cố định'} cm; cân nặng: ${shape?.weightKg?.join('–') ?? 'không cố định'} kg. Dấu hiệu thường gặp: ${list(shape?.features)}. ${race.appearanceNote ?? ''} ${profile?.biology ?? ''}`;
  const society = `${profile?.society ?? main?.summary ?? race.standing} Quê hương hoặc cộng đồng lớn: ${list(race.homelands)}. Vị thế năm 1444: ${race.standing}. ${race.spreadNote ?? ''}`;
  const daily = `${profile?.dailyLife ?? `Đời sống thay đổi theo giai cấp, nghề và nơi cư trú; tiếng thường dùng là ${race.language}.`} ${profile?.family ?? 'Gia đình và thừa kế tuân theo luật địa phương, không do nhãn chủng tộc quyết định hoàn toàn.'}`;
  const law = `${profile?.faithAndLaw ?? `Quan hệ thường gặp với Giáo hội: ${race.church}.`} ${profile?.misconceptions ?? 'Không suy tính cách, đạo đức hoặc nghề nghiệp cá nhân chỉ từ chủng tộc.'}`;

  const topic = (suffix, title, body, semantic, topicKeys) => baseEntry({
    id: `raceguide_${slug(race.id)}-${suffix}`,
    title: `${race.name} · ${title}`,
    content: `${ejs}\n${body}`,
    summaryText: summary(body, 460),
    keys: [...common.keys, ...topicKeys],
    embedding: `${race.name}. ${semantic}. ${summary(body, 800)}`,
    priority: 8,
    weight: 11,
  });

  return {
    id: `book-chuyen-biet-${slug(race.id)}`,
    name: `Chủng tộc chuyên biệt · ${race.name}`,
    version: 1,
    scope: { kind: 'race', refId: race.id },
    enabled: true,
    autoScope: true,
    priority: 3,
    entries: [
      topic('sinh-hoc', 'sinh học và hình thể', form, 'cơ thể hình dáng tuổi thọ giác quan điểm yếu quần áo', ['hình thể', 'sinh học', 'tuổi thọ', 'ngoại hình']),
      topic('xa-hoi', 'xã hội và phân bố', society, 'giai cấp chính quyền quê hương cộng đồng nghề nghiệp địa vị', ['xã hội', 'quê hương', 'giai cấp', 'phân bố']),
      topic('doi-thuong', 'gia đình và đời thường', daily, 'gia đình trẻ em hôn nhân thừa kế nghề ăn ở sinh hoạt', ['gia đình', 'đời thường', 'sinh kế', 'hôn nhân']),
      topic('luat-duc-tin', 'luật, đức tin và định kiến', law, 'luật pháp giáo hội tín ngưỡng định kiến quyền công dân', ['luật pháp', 'Giáo hội', 'đức tin', 'định kiến']),
    ],
  };
});

writeFileSync(join(OUT, '80-chung-toc-chuyen-biet.json'), `${JSON.stringify(bundle(raceBooks), null, 2)}\n`);

console.log(`76-thuong-mai-am-thuc.json: ${tradeEntries.length} entry`);
console.log(`77-the-gioi-quan-suy-luan.json: ${worldBooks.length} sách, ${worldBooks.reduce((sum, book) => sum + book.entries.length, 0)} entry`);
console.log(`80-chung-toc-chuyen-biet.json: ${raceBooks.length} sách, ${raceBooks.reduce((sum, book) => sum + book.entries.length, 0)} entry`);
