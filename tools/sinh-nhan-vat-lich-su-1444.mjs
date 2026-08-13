/**
 * Sinh 69 nhân vật dựa trên người có thật thành ba tầng lore.
 * Tất cả nhân vật dùng giới tính nữ trong canon Europa; tên lịch sử gốc vẫn được
 * giữ làm từ khóa và ghi rõ trong hồ sơ để người chơi nhận ra nguyên mẫu.
 * Chạy: node tools/sinh-nhan-vat-lich-su-1444.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const source = readJson(join(ROOT, 'tools', 'nhan-vat-lich-su-1444.json'));
const nations = readJson(join(ROOT, 'data', 'nations.json')).nations;
const races = readJson(join(ROOT, 'data', 'races.json')).races;
const religions = readJson(join(ROOT, 'data', 'religions.json')).religions;

const FEMALE_NAMES = {
  'mehmed-ii': 'Mehmeda II', 'murad-ii': 'Murada II',
  'candarlil-halil-pasha': 'Halila Çandarlı Pasha', 'zafer-sah-hatun': 'Zağana Pasha',
  'frederick-iii': 'Frederica III von Habsburg', 'albert-achilles': 'Alberta Achilles',
  'louis-bavaria-landshut': 'Ludwiga IX xứ Bavaria-Landshut', 'aeneas-sylvius': 'Aenea Silvia Piccolomini',
  'charles-vii': 'Charlotte VII của Pháp', 'agnes-sorel': 'Agnès Sorel',
  'jean-bureau': 'Jeanne Bureau', 'louis-dauphin': 'Louise, Nữ Thái tử Pháp',
  'joan-of-arc': 'Jeanne d’Arc',
  'felix-v': 'Felicia V (Amadea VIII xứ Savoy)', 'nicholas-of-cusa': 'Nicole xứ Cusa',
  bessarion: 'Bessaria', 'francesco-condulmer': 'Francesca Condulmer',
  'john-viii': 'Ioanna VIII Palaiologina', 'constantine-palaiologos': 'Constantina Palaiologina',
  'thomas-palaiologos': 'Thomais Palaiologina', 'gemistus-pletho': 'Gemista Plethon',
  'ital-reding-elder': 'Itala Reding Già', 'hans-frund': 'Hanna Fründ',
  'hans-von-rechberg': 'Johanna von Rechberg', 'heinrich-von-hewen': 'Henrietta von Hewen',
  'haci-i-giray': 'Hacı Giray Hatun', 'ulugh-muhammad': 'Uluğa Muhammad',
  'kuchuk-muhammad': 'Küçüka Muhammad', 'sayid-ahmad-i': 'Sayida Ahmad I',
  'cosimo-medici': 'Cosima de’ Medici', 'filippo-maria-visconti': 'Filippa Maria Visconti',
  'francesco-sforza': 'Francesca Sforza', 'francesco-foscari': 'Francesca Foscari',
  'henry-vi': 'Henrietta VI', 'william-de-la-pole': 'Wilhelmina de la Pole',
  'humphrey-gloucester': 'Humphria, Nữ công tước Gloucester',
  'richard-york': 'Richarda, Nữ công tước York',
  'casimir-jagiellon': 'Casimira Jagiellon', 'zbignew-olesnicki': 'Zbigniewa Oleśnicka',
  'jonas-gostautas': 'Joanna Goštautė', svitrigaila: 'Švitrigailė',
  'john-hunyadi': 'Johanna Hunyadi', skanderbeg: 'Gjergja Kastrioti Skanderbeg',
  'durad-brankovic': 'Đurđa Branković', 'vlad-ii-dracul': 'Vlada II Dracul',
  'philip-good': 'Philippa the Good', 'charles-charolais': 'Charlotte xứ Charolais',
  'nicolas-rolin': 'Nicole Rolin', 'isabella-portugal': 'Isabella của Portugal',
  'christopher-bavaria': 'Christopha xứ Bavaria', 'karl-knutsson': 'Karla Knutsdotter Bonde',
  'erik-pomerania': 'Erika xứ Pomerania', 'dorothea-brandenburg': 'Dorothea của Brandenburg',
  'konrad-erlichshausen': 'Konrada von Erlichshausen', 'hans-von-baysen': 'Johanna von Baysen',
  'ludwig-erlichshausen': 'Ludwiga von Erlichshausen', 'gabriel-von-baysen': 'Gabriela von Baysen',
  'vasily-ii': 'Vasilisa II của Moscow', 'dmitry-shemyaka': 'Dmitria Shemyaka',
  'boris-tver': 'Borislava Aleksandrovna xứ Tver', 'euthymius-ii-novgorod': 'Euthymia II của Novgorod',
  'juan-ii-castile': 'Juana II của Castile', 'alvaro-de-luna': 'Álvara de Luna',
  'alfonso-v-aragon': 'Alfonsa V của Aragon', 'afonso-v-portugal': 'Afonsa V của Portugal',
  'johann-luneburg': 'Johanna Lüneburg', 'johann-bere': 'Johanna Bere',
  'hinrich-castorp': 'Henrika Castorp', 'hans-bornemann': 'Hanna Bornemann',
};

const HISTORICAL_WOMEN = new Set(['agnes-sorel', 'isabella-portugal', 'dorothea-brandenburg', 'joan-of-arc']);
const nationById = new Map(nations.map((item) => [item.id, item]));
const raceById = new Map(races.map((item) => [item.id, item]));
const religionById = new Map(religions.map((item) => [item.id, item]));
const unique = (items) => [...new Set(items.map((item) => String(item).trim()).filter(Boolean))];
const slug = (value) => String(value).toLocaleLowerCase('vi').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');
const short = (value, max = 500) => {
  const text = String(value).replace(/<%[\s\S]*?%>/g, '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return `${(stop > max / 2 ? cut.slice(0, stop + 1) : cut).trim()}…`;
};

const replaceWord = (text, sourceWord, targetWord) => text.replace(
  new RegExp(`(?<![\\p{L}])${sourceWord}(?![\\p{L}])`, 'gu'), targetWord,
);

function feminize(value, person) {
  let text = String(value);
  for (const other of [...source.people].sort((a, b) => b.name.length - a.name.length)) {
    text = text.split(other.name).join(FEMALE_NAMES[other.id]);
  }
  for (const [from, to] of [
    ['Friedrich III', 'Frederica III'], ['Charles VII', 'Charlotte VII'],
    ['Mehmed', 'Mehmeda'], ['Murad', 'Murada'], ['Friedrich', 'Frederica'],
    ['Eugene IV', 'Eugenia IV'], ['Felix V', 'Felicia V'], ['John VIII', 'Ioanna VIII'],
    ['Constantine', 'Constantina'], ['Thomas Palaiologos', 'Thomais Palaiologina'],
    ['Juan II', 'Juana II'], ['Alfonso V', 'Alfonsa V'], ['Afonso V', 'Afonsa V'],
  ]) text = replaceWord(text, from, to);
  const historicalFirst = person.name.split(/[ ,(]/u)[0];
  const canonFirst = FEMALE_NAMES[person.id].split(/[ ,(]/u)[0];
  if (historicalFirst !== canonFirst) text = replaceWord(text, historicalFirst, canonFirst);
  for (const [from, to] of [
    ['Đối Giáo hoàng', 'Nữ đối Giáo hoàng'], ['Giáo hoàng', 'Nữ Giáo hoàng'],
    ['giáo hoàng', 'nữ giáo hoàng'], ['Hoàng đế', 'Nữ Hoàng đế'], ['hoàng đế', 'nữ hoàng đế'],
    ['Thái tử', 'Nữ Thái tử'], ['thái tử', 'nữ thái tử'],
    ['Sultan', 'Nữ Sultan'], ['sultan', 'nữ sultan'], ['Vua', 'Nữ vương'], ['vua', 'nữ vương'],
    ['Hãn', 'Nữ Hãn'], ['Doge', 'Nữ Doge'], ['Công tước', 'Nữ Công tước'], ['công tước', 'nữ công tước'],
    ['anh trai', 'chị gái'], ['em trai', 'em gái'], ['con trai', 'con gái'], ['cháu trai', 'cháu gái'],
    ['con rể', 'con dâu'], ['chồng', 'vợ'], ['anh em', 'chị em'],
  ]) text = replaceWord(text, from, to);
  text = replaceWord(text, 'Ông', 'Bà');
  text = replaceWord(text, 'ông', 'bà');
  text = replaceWord(text, 'Cậu', 'Cô');
  text = replaceWord(text, 'cậu', 'cô');
  text = text
    .replaceAll('Nữ đối Nữ Giáo hoàng', 'Nữ đối Giáo hoàng')
    .replaceAll('đối Nữ Giáo hoàng', 'Nữ đối Giáo hoàng')
    .replaceAll('Nữ nữ công tước', 'Nữ công tước')
    .replaceAll('Nữ Nữ Công tước', 'Nữ Công tước')
    .replaceAll('uy tín quân sự của cha', 'uy tín quân sự của mẹ')
    .replaceAll('gọi cha mình trở lại', 'gọi mẹ mình trở lại')
    .replaceAll('quan hệ với cha Charlotte VII', 'quan hệ với mẹ Charlotte VII');
  return text;
}

const ids = new Set();
for (const person of source.people) {
  if (ids.has(person.id)) throw new Error(`Trùng id nhân vật: ${person.id}`);
  ids.add(person.id);
  if (!FEMALE_NAMES[person.id]) throw new Error(`${person.id}: thiếu tên nữ canon`);
  if (!nationById.has(person.nationId)) throw new Error(`${person.id}: nationId không tồn tại`);
  if (!raceById.has(person.raceId)) throw new Error(`${person.id}: raceId không tồn tại`);
  if (!religionById.has(person.religionId)) throw new Error(`${person.id}: religionId không tồn tại`);
  for (const field of ['name', 'role', 'anchor', 'europa', 'agenda', 'conflict']) {
    if (String(person[field] ?? '').trim() === '') throw new Error(`${person.id}: thiếu ${field}`);
  }
}
if (Object.keys(FEMALE_NAMES).length !== source.people.length) {
  throw new Error('Bảng tên nữ canon và danh sách nguyên mẫu lịch sử không cùng số lượng.');
}

const makeEntry = ({ id, title, body, summary, keys, embedding, knowledge, requiresKnowledge, priority }) => ({
  id, title, type: 'person', content: body, summary,
  keys: unique(keys), matchMode: 'wholeWord', caseSensitive: false, constant: false,
  embedding: { text: embedding, threshold: 0.17 }, knowledge,
  ...(requiresKnowledge ? { requiresKnowledge } : {}),
  placement: 'block', role: 'system', weight: 12, budgetPriority: priority,
  recurse: false, preventRecursion: false, triggerOnce: false,
});

const books = nations.map((nation) => {
  const people = source.people.filter((person) => person.nationId === nation.id);
  const expected = nation.id === 'nation_frank' ? 5 : 4;
  if (people.length !== expected) throw new Error(`${nation.name}: cần đúng ${expected} nhân vật, hiện có ${people.length}`);
  const entries = people.flatMap((person) => {
    const race = raceById.get(person.raceId);
    const faith = religionById.get(person.religionId);
    const canonName = FEMALE_NAMES[person.id];
    const role = feminize(person.role, person);
    const anchor = feminize(person.anchor, person);
    const europa = feminize(person.europa, person);
    const agenda = feminize(person.agenda, person);
    const conflict = feminize(person.conflict, person);
    const fact = `fact_than-can-historical-${person.id}`;
    const keys = [canonName, person.name, ...(person.keys ?? []), nation.name];
    const originalGender = HISTORICAL_WOMEN.has(person.id) ? 'nữ' : 'nam';
    const header = `<% const tuoi1444 = ${1444 - person.born}; const cungPhe = state.knowledge && state.knowledge.factionId === '${person.nationId}'; %>`;
    const publicBody = `${header}\n[HỒ SƠ NHÂN VẬT LỊCH SỬ BIẾN TẤU · mốc 1444 · <%= cungPhe ? 'góc nhìn trong phe' : 'góc nhìn đối chiếu' %>]\n\n` +
      `Danh tính canon: ${canonName}; giới tính canon: Nữ; khoảng <%= tuoi1444 %> tuổi ở mốc mở màn. Nguyên mẫu lịch sử ngoài đời: ${person.name} (${originalGender}). Chủng tộc Europa: ${race.name}. Đức tin công khai: ${faith.name}.\n\n` +
      `Vai trò năm 1444: ${role}.\n\nXương sống lịch sử ngoài đời đã chuyển sang bản nữ trong canon: ${anchor}\n\n` +
      `Phần biến tấu Europa: ${europa}\n\n` +
      `Giới hạn canon: đây là một người phụ nữ và mọi đại từ dành cho nhân vật phải là “bà/cô/ả/nàng” tùy ngữ cảnh, không dùng “ông/anh/chàng”. Chức vụ và hoàn cảnh trên khóa tại năm 1444; không kể thành tựu, cái chết, kế vị hoặc thất bại về sau như định mệnh.`;
    const privateBody = `${header}\n[HỒ SƠ THÂN CẬN · ${canonName} · NỮ · mốc 1444]\n\n` +
      `Mục tiêu có thể quan sát khi đã tiếp xúc đủ lâu: ${agenda}\n\n` +
      `Cách dùng trong cảnh: người phụ nữ này thương lượng từ đúng chức vụ năm 1444, cân nhắc tiền, người, luật, gia đình và danh dự trước khi dùng ma pháp. Bà có thể hợp tác, lừa, từ chối hoặc đổi ý theo lợi ích; không biến một nhân vật lịch sử thành người phát nhiệm vụ vô điều kiện.\n\n` +
      `Rào chủng tộc: ${race.name} ảnh hưởng hình thể và trải nghiệm xã hội, không tự quyết đạo đức, trí tuệ hay phe chính trị.`;
    const secretBody = `${header}\n[ĐỘNG CƠ NỘI TÂM DÀNH CHO MÔ PHỎNG · ${canonName} · NỮ]\n\n` +
      `Mâu thuẫn cốt lõi ở mốc 1444: ${conflict}\n\n` +
      `Quy tắc diễn: để mâu thuẫn này tạo do dự, sai lầm và đổi chiến thuật; không dùng nó như lời tiên tri buộc bà tái diễn lịch sử thật sau 1444. Không để NPC tự thú động cơ này nếu chưa có cảnh, áp lực hoặc quan hệ đủ mạnh.`;
    const semantic = `${canonName}; nguyên mẫu ${person.name}. Nữ. ${role}. ${anchor} ${europa}`;
    return [
      makeEntry({
        id: `historical_${slug(person.id)}`, title: `${canonName} · bản nữ của ${person.name} · năm 1444`,
        body: publicBody, summary: short(`${canonName}, bản nữ của ${person.name}: ${role}. ${anchor}`),
        keys, embedding: semantic, knowledge: 'public', priority: 9,
      }),
      makeEntry({
        id: `historical_${slug(person.id)}-than-can`, title: `${canonName} · mục tiêu và cách giao thiệp`,
        body: privateBody, summary: short(`${canonName}: ${agenda}`),
        keys, embedding: `${semantic} mục tiêu quan hệ thương lượng ${agenda}`,
        knowledge: 'gated', requiresKnowledge: [fact], priority: 8,
      }),
      makeEntry({
        id: `historical_${slug(person.id)}-noi-tam`, title: `${canonName} · mâu thuẫn nội tâm`,
        body: secretBody, summary: short(`${canonName}: ${conflict}`),
        keys, embedding: `${semantic} bí mật nội tâm động cơ ${conflict}`,
        knowledge: 'secret', priority: 7,
      }),
    ];
  });
  return {
    id: `book-nhan-vat-lich-su-${slug(nation.id)}`,
    name: `Nhân vật lịch sử nữ 1444 · ${nation.name}`,
    version: 2, scope: { kind: 'nation', refId: nation.id },
    enabled: true, autoScope: true, priority: 5, entries,
  };
});

const output = { kind: 'eu1444-lorebook', schemaVersion: 1, exportedAt: 0, books };
writeFileSync(join(ROOT, 'lorebooks', '84-nhan-vat-lich-su-1444.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`84-nhan-vat-lich-su-1444.json: ${books.length} sách, ${source.people.length} nhân vật nữ dựa trên người có thật, ${books.reduce((n, b) => n + b.entries.length, 0)} entry`);
