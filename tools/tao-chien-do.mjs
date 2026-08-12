/**
 * SINH `data/campaign-map.json` — CHIẾN ĐỒ, bản đồ thứ hai của dự án.
 *
 *   node tools/tao-chien-do.mjs
 *
 * VÌ SAO CÓ BẢN ĐỒ THỨ HAI. `data/world-map.json` là bản đồ để ĐO ĐƯỜNG ĐI của
 * Phần 15: nó chỉ cần toạ độ và hệ số tốc độ, và nó cố ý không biết ai đang giữ
 * cái gì. Chiến đồ trả lời một câu hỏi khác hẳn — *"đất này của phe nào, và muốn
 * lấy nó thì phải hạ những chỗ nào"* — nên nó cần thứ mà bản đồ kia không có:
 * ba tầng lồng nhau, thành trì và thị trấn làm MỤC TIÊU, và một hình học đủ thưa
 * để hai vùng không bao giờ đè lên nhau trên màn hình. Hai file, hai câu hỏi,
 * không file nào chép lại file nào — `world-map.json` vẫn là nguồn toạ độ thật,
 * chiến đồ chỉ MƯỢN nó làm điểm neo địa lý rồi nới ra cho dễ nhìn.
 *
 * BA TẦNG (mục vựng của README mục 6.1 được giữ nguyên):
 *
 *   qg_*     QUỐC GIA   — Pháp, Đế quốc La Mã Thần thánh, Công quốc Burgundy…
 *   vung_*   VÙNG LỚN   — tỉnh/miền bên trong một quốc gia
 *   huyen_*  HUYỆN      — ô nhỏ nhất, mỗi ô có địa hình và có thể có một ĐIỂM:
 *                         thành trì, thị trấn, hoặc chỉ một cái làng
 *
 * Chỉ tầng huyện mới có mục tiêu chiếm được. Vùng và quốc gia KHÔNG chiếm trực
 * tiếp: chúng đổ khi mọi thành trì và thị trấn bên trong đã đổi chủ, hoặc khi
 * chủ của chúng chịu làm chư hầu. Luật ấy sống ở `src/systems/campaign/`, file
 * này chỉ dựng cái sân cho nó.
 *
 * VÌ SAO LÀ SCRIPT CHỨ KHÔNG GÕ TAY: hơn tám trăm nút. Toạ độ phải suy ra từ
 * một bảng đọc được rồi được một vòng nới lỏng xác định (deterministic) đẩy cho
 * hết chồng lấn — gõ tay thì không ai kiểm lại được, và hai vùng đè nhau chỉ lộ
 * ra khi người chơi click nhầm vào vùng nằm dưới.
 *
 * SINH LẠI LÀ ỔN ĐỊNH: mọi ngẫu nhiên đều từ `mulberry32` gieo bằng băm của id
 * cha, nên chạy hai lần cho ra hai file giống hệt nhau, và sửa một quốc gia
 * không làm xê dịch quốc gia bên cạnh.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// BẢNG KHAI TAY — phần duy nhất của chiến đồ do người viết, mọi thứ khác suy ra
// ---------------------------------------------------------------------------

/**
 * BIỂN VÀ VỊNH. Toạ độ vĩ/kinh độ của một điểm giữa vùng nước ấy.
 *
 * Nước là nút THẬT trên chiến đồ chứ không phải khoảng trống giữa các nút: quân
 * muốn sang đảo Anh thì phải đi qua một ô biển, và ô biển ấy phải nhìn thấy được
 * để người chơi hiểu vì sao đạo quân của mình dừng lại ở bờ. `coasts` là những
 * quốc gia có cảng mở ra vùng nước này.
 */
const BIEN = [
  {
    id: 'bien-bac',
    name: 'Biển Bắc',
    lat: 56.0,
    lon: 3.0,
    coasts: ['realm_england', 'realm_scotland', 'realm_denmark', 'realm_norway', 'realm_burgundy', 'realm_hre'],
  },
  {
    id: 'bien-baltic',
    name: 'Biển Baltic',
    lat: 57.5,
    lon: 19.5,
    coasts: ['realm_denmark', 'realm_sweden', 'realm_teutonic', 'realm_livonia', 'realm_poland', 'realm_hre'],
  },
  {
    id: 'bien-ireland',
    name: 'Biển Ireland',
    lat: 53.5,
    lon: -5.5,
    coasts: ['realm_england', 'realm_scotland'],
  },
  {
    id: 'bien-manche',
    name: 'Eo biển Manche',
    lat: 50.0,
    lon: -1.5,
    coasts: ['realm_england', 'realm_france', 'realm_burgundy'],
  },
  {
    id: 'bien-biscay',
    name: 'Vịnh Biscay',
    lat: 45.0,
    lon: -4.5,
    coasts: ['realm_france', 'realm_castile', 'realm_portugal'],
  },
  {
    id: 'bien-tay-dia-trung-hai',
    name: 'Tây Địa Trung Hải',
    lat: 40.0,
    lon: 5.0,
    coasts: ['realm_aragon', 'realm_france', 'realm_genoa', 'realm_granada', 'realm_naples', 'realm_castile'],
  },
  {
    id: 'bien-tyrrhenian',
    name: 'Biển Tyrrhenian',
    lat: 39.8,
    lon: 12.5,
    coasts: ['realm_naples', 'realm_papal', 'realm_genoa', 'realm_florence'],
  },
  {
    id: 'bien-adriatic',
    name: 'Biển Adriatic',
    lat: 43.0,
    lon: 15.0,
    coasts: ['realm_venice', 'realm_naples', 'realm_hungary', 'realm_albania', 'realm_papal'],
  },
  {
    id: 'bien-aegean',
    name: 'Biển Aegea',
    lat: 38.5,
    lon: 25.0,
    coasts: ['realm_byzantine', 'realm_ottoman', 'realm_venice', 'realm_albania'],
  },
  {
    id: 'bien-hac-hai',
    name: 'Hắc Hải',
    lat: 43.5,
    lon: 34.0,
    coasts: ['realm_ottoman', 'realm_byzantine', 'realm_crimea', 'realm_wallachia', 'realm_great-horde'],
  },
  {
    id: 'bien-caspi',
    name: 'Biển Caspi',
    lat: 43.0,
    lon: 50.5,
    coasts: ['realm_astrakhan', 'realm_great-horde'],
  },
  {
    id: 'bien-dai-tay-duong',
    name: 'Đại Tây Dương',
    lat: 42.0,
    lon: -13.5,
    coasts: ['realm_portugal', 'realm_castile', 'realm_scotland'],
  },
];

/**
 * ĐẢO. Nút của những nơi này được đẩy xa thêm khỏi đất liền.
 *
 * Không phải để đẹp: một hòn đảo vẽ sát bờ trông y hệt một tỉnh ven biển, và
 * người chơi sẽ đưa bộ binh tới đó rồi mới biết là không có đường bộ.
 */
const DAO = new Set(['realm_england', 'realm_scotland', 'hold_gotland', 'hold_mont-saint-michel', 'hold_gibraltar']);

/**
 * MÀU CỦA CÁC PHE LỚN. Những phe còn lại nhận màu sinh theo góc vàng ở dưới.
 *
 * Chọn tay tám thế lực của Phần 14 cộng vài nước có màu ai cũng nhớ, vì màu sinh
 * máy đúng về mặt tương phản nhưng sai về mặt trí nhớ: không ai chấp nhận Giáo
 * triều màu xanh lá.
 */
const MAU = {
  realm_france: '#3b5fc0',
  realm_hre: '#c8a032',
  realm_burgundy: '#6f3fa8',
  realm_england: '#b03030',
  realm_scotland: '#2f6f8f',
  realm_ottoman: '#2f8a52',
  realm_byzantine: '#8d2f6a',
  realm_papal: '#d8cfae',
  realm_venice: '#b8452f',
  realm_swiss: '#a02020',
  'realm_great-horde': '#8a6a2f',
  realm_poland: '#c04a6a',
  realm_castile: '#c07a2f',
  realm_aragon: '#c8b02f',
  realm_muscovy: '#4a7a3a',
  realm_teutonic: '#5a5a6a',
  realm_denmark: '#a03a4a',
  realm_hungary: '#3a7a6a',
};

/**
 * SỐ VÙNG LỚN SINH THÊM cho quốc gia chưa có đủ tỉnh trong `regions.json`.
 *
 * `regions.json` khai 19 tỉnh cho Đế quốc và 9 cho Pháp, còn Muscovy thì không
 * có tỉnh nào — không phải vì Muscovy nhỏ mà vì lorebook chưa đi tới đó. Một
 * quốc gia chỉ có một vùng thì cơ chế chinh phục ba tầng không có gì để diễn,
 * nên chỗ nào thiếu thì sinh bù tới con số ở đây.
 */
const SO_VUNG = {
  realm_muscovy: 5,
  realm_castile: 5,
  realm_ottoman: 5,
  realm_poland: 4,
  realm_lithuania: 4,
  realm_england: 4,
  realm_naples: 4,
  realm_aragon: 4,
  realm_portugal: 3,
  realm_scotland: 3,
  realm_sweden: 3,
  realm_norway: 3,
  realm_denmark: 3,
  realm_hungary: 4,
  realm_wallachia: 3,
  'realm_great-horde': 4,
  realm_novgorod: 4,
  realm_kazan: 3,
  realm_astrakhan: 3,
  realm_crimea: 3,
  realm_livonia: 3,
  realm_byzantine: 3,
  realm_milan: 3,
  realm_florence: 3,
  realm_genoa: 3,
  realm_papal: 3,
  realm_savoy: 3,
  realm_granada: 3,
  realm_albania: 3,
  realm_burgundy: 4,
  realm_swiss: 3,
  realm_teutonic: 3,
  realm_pskov: 2,
  realm_tver: 2,
  realm_ryazan: 2,
  realm_siena: 2,
  realm_lucca: 2,
  realm_ferrara: 2,
  realm_mantua: 2,
  realm_urbino: 2,
};

/** Số vùng tối thiểu cho một quốc gia không có tên trong bảng trên. */
const VUNG_TOI_THIEU = 2;

/** Số huyện mỗi vùng lớn. Vùng có sẵn thành trì thật thì lấy trần trên. */
const HUYEN_MIN = 3;
const HUYEN_MAX = 6;

/**
 * KHO ÂM TIẾT ĐỊA DANH theo văn hoá.
 *
 * Tên nơi chốn không lấy từ `data/names.json` được: kho đó là tên NGƯỜI, và mười
 * họ mỗi tộc không đủ cho tám trăm huyện. Ghép tiền tố với hậu tố cho ra hàng
 * trăm tên nghe đúng vùng mà vẫn xác định được từ seed.
 */
const DIA_DANH = {
  frank: {
    pre: ['Beau', 'Mont', 'Val', 'Châte', 'Roche', 'Neuf', 'Bel', 'Fon', 'Cler', 'Aubi', 'Sance', 'Vau'],
    suf: ['court', 'ville', 'mont', 'lieu', 'fort', 'vaux', 'chy', 'gny', 'sac', 'bourg', 'rand', 'nay'],
  },
  teuton: {
    pre: ['Stein', 'Adler', 'Hohen', 'Wald', 'Raben', 'Falken', 'Eber', 'Greifen', 'Linden', 'Königs', 'Rot', 'Dorn'],
    suf: ['burg', 'bach', 'feld', 'berg', 'au', 'stein', 'heim', 'dorf', 'tal', 'reut', 'furt', 'egg'],
  },
  latin: {
    pre: ['Castel', 'Monte', 'Villa', 'Rocca', 'Borgo', 'Val', 'Sasso', 'Colle', 'Torre', 'Poggio', 'Cam', 'Sere'],
    suf: ['nuovo', 'bello', 'franco', 'vecchio', 'alto', 'sano', 'rino', 'tino', 'lungo', 'forte', 'grano', 'sole'],
  },
  iberia: {
    pre: ['Villa', 'Peña', 'Castro', 'Monte', 'Torre', 'Val', 'Alca', 'Puerto', 'Rio', 'Guada', 'Alma', 'Cala'],
    suf: ['nueva', 'franca', 'real', 'blanca', 'sola', 'mayor', 'verde', 'fría', 'alta', 'seca', 'roja', 'zar'],
  },
  anglo: {
    pre: ['Ash', 'Ock', 'Wynd', 'Thorn', 'Bram', 'Cald', 'Hare', 'Elm', 'Stan', 'Marl', 'Oak', 'Beck'],
    suf: ['ford', 'ton', 'bury', 'field', 'wick', 'ham', 'shire', 'worth', 'stead', 'combe', 'dale', 'mere'],
  },
  scot: {
    pre: ['Dun', 'Inver', 'Kil', 'Auch', 'Loch', 'Glen', 'Craig', 'Bal', 'Strath', 'Carn', 'Ard', 'Ben'],
    suf: ['moor', 'ken', 'bane', 'dour', 'ross', 'noch', 'mont', 'brae', 'shiel', 'garry', 'vaig', 'lyne'],
  },
  bac_au: {
    pre: ['Björn', 'Val', 'Hol', 'Öst', 'Nord', 'Sten', 'Vik', 'Grön', 'Aske', 'Fjäll', 'Sol', 'Rä'],
    suf: ['stad', 'holm', 'vik', 'näs', 'fors', 'berg', 'lund', 'borg', 'dal', 'sund', 'hamn', 'by'],
  },
  baltic: {
    pre: ['Biał', 'Nowo', 'Staro', 'Góra', 'Ostro', 'Wil', 'Krasno', 'Zielo', 'Dobro', 'Lesz', 'Sier', 'Mia'],
    suf: ['gród', 'wice', 'ław', 'yn', 'burg', 'mark', 'nowo', 'ki', 'sza', 'ów', 'niec', 'żno'],
  },
  rus: {
    pre: ['Belo', 'Novo', 'Svet', 'Krasno', 'Goro', 'Volo', 'Yaro', 'Zvon', 'Ozer', 'Sosno', 'Kame', 'Tikho'],
    suf: ['gorod', 'sk', 'ovo', 'ino', 'yar', 'grad', 'tsy', 'vets', 'nya', 'bor', 'zero', 'mir'],
  },
  magyar: {
    pre: ['Fehér', 'Nagy', 'Kis', 'Vár', 'Szent', 'Bal', 'Cser', 'Somo', 'Déva', 'Túr', 'Kék', 'Zala'],
    suf: ['vár', 'falva', 'hely', 'szeg', 'háza', 'patak', 'bánya', 'mező', 'halom', 'kút', 'liget', 'rév'],
  },
  balkan: {
    pre: ['Ohr', 'Skad', 'Berat', 'Kruj', 'Drin', 'Vlor', 'Priz', 'Debar', 'Elba', 'Kosov', 'Novo', 'Zeta'],
    suf: ['ova', 'ica', 'esh', 'ari', 'iti', 'oni', 'osi', 'ani', 'ela', 'ura', 'ista', 'ovo'],
  },
  hy_lap: {
    pre: ['Neo', 'Kastro', 'Agio', 'Palaio', 'Mega', 'Kalo', 'Chryso', 'Petro', 'Ano', 'Kato', 'Xero', 'Pyrgo'],
    suf: ['polis', 'kastro', 'chori', 'vouni', 'limni', 'pyrgos', 'nero', 'vrysi', 'rachi', 'valo', 'nisi', 'gialos'],
  },
  nam_phuong: {
    pre: ['Kara', 'Ak', 'Gök', 'Demir', 'Yeni', 'Alt', 'Bey', 'Kızıl', 'Sarı', 'Ulu', 'Taş', 'Kuru'],
    suf: ['kale', 'hisar', 'köy', 'pınar', 'bey', 'tepe', 'ova', 'dağ', 'saray', 'burun', 'çay', 'yurt'],
  },
  thao_nguyen: {
    pre: ['Ak', 'Kara', 'Sarı', 'Kök', 'Tau', 'Yur', 'Baş', 'Kum', 'Ala', 'Tem', 'Uzun', 'Buz'],
    suf: ['tepe', 'say', 'bulak', 'orda', 'tau', 'köl', 'yurt', 'qala', 'taş', 'bay', 'aral', 'özen'],
  },
  lun: {
    pre: ['Búa', 'Đe', 'Mạch', 'Cột', 'Lò', 'Hầm', 'Đá', 'Sắt', 'Than', 'Vòm', 'Đục', 'Quặng'],
    suf: ['Sâu', 'Đỏ', 'Xám', 'Cũ', 'Lớn', 'Ngầm', 'Vững', 'Tối', 'Nóng', 'Đen', 'Gãy', 'Câm'],
    ghepCach: true,
  },
  rung_gia: {
    pre: ['Nhánh', 'Lá', 'Sương', 'Rêu', 'Cội', 'Suối', 'Vọng', 'Bóng', 'Vỏ', 'Hạt', 'Nhựa', 'Tán'],
    suf: ['Bạc', 'Xanh', 'Sớm', 'Cổ', 'Thấp', 'Câm', 'Dài', 'Mờ', 'Ẩm', 'Vàng', 'Non', 'Khuya'],
    ghepCach: true,
  },
};

/** Quốc gia → kho địa danh. Không có tên ở đây thì rơi về `frank`. */
const VAN_HOA = {
  realm_france: 'frank',
  realm_burgundy: 'frank',
  realm_savoy: 'frank',
  realm_hre: 'teuton',
  realm_swiss: 'teuton',
  realm_teutonic: 'teuton',
  realm_milan: 'latin',
  realm_venice: 'latin',
  realm_genoa: 'latin',
  realm_florence: 'latin',
  realm_siena: 'latin',
  realm_lucca: 'latin',
  realm_ferrara: 'latin',
  realm_mantua: 'latin',
  realm_urbino: 'latin',
  realm_papal: 'latin',
  realm_naples: 'latin',
  realm_castile: 'iberia',
  realm_aragon: 'iberia',
  realm_portugal: 'iberia',
  realm_granada: 'iberia',
  realm_england: 'anglo',
  realm_scotland: 'scot',
  realm_denmark: 'bac_au',
  realm_sweden: 'bac_au',
  realm_norway: 'bac_au',
  realm_poland: 'baltic',
  realm_lithuania: 'rung_gia',
  realm_livonia: 'rung_gia',
  realm_muscovy: 'rus',
  realm_novgorod: 'rus',
  realm_pskov: 'rus',
  realm_tver: 'rus',
  realm_ryazan: 'rus',
  realm_hungary: 'magyar',
  realm_wallachia: 'magyar',
  realm_albania: 'balkan',
  realm_byzantine: 'hy_lap',
  realm_ottoman: 'nam_phuong',
  'realm_great-horde': 'thao_nguyen',
  realm_crimea: 'thao_nguyen',
  realm_kazan: 'thao_nguyen',
  realm_astrakhan: 'thao_nguyen',
  prov_alps: 'lun',
  prov_carpathian: 'magyar',
  'prov_steppe-pontic': 'thao_nguyen',
};

/**
 * ĐỊA HÌNH CỦA CHIẾN ĐỒ — cùng bộ từ vựng với `world-map.json` để hai bản đồ
 * không nói hai thứ tiếng, cộng thêm `bien` cho nút nước.
 *
 * `speed` nhân vào tốc độ hành quân, `mau` là màu nền ô trên màn hình.
 */
const DIA_HINH = {
  'dong-bang': { name: 'Đồng bằng', speed: 1.0, mau: '#6e7a4a' },
  song: { name: 'Ven sông', speed: 1.15, mau: '#4d7a72' },
  doi: { name: 'Đồi', speed: 0.85, mau: '#7a6a3f' },
  'thao-nguyen': { name: 'Thảo nguyên', speed: 0.9, mau: '#8a8352' },
  rung: { name: 'Rừng', speed: 0.7, mau: '#3f5c3a' },
  'dam-lay': { name: 'Đầm lầy', speed: 0.6, mau: '#4a5340' },
  nui: { name: 'Núi', speed: 0.45, mau: '#6b6660' },
  bien: { name: 'Biển', speed: 0.8, mau: '#2c4a5e' },
};

/** Địa hình con có thể lệch khỏi địa hình cha theo bảng này. */
const DIA_HINH_LAN_CAN = {
  'dong-bang': ['dong-bang', 'dong-bang', 'song', 'rung', 'doi'],
  song: ['song', 'dong-bang', 'dam-lay', 'dong-bang'],
  doi: ['doi', 'doi', 'nui', 'rung', 'dong-bang'],
  'thao-nguyen': ['thao-nguyen', 'thao-nguyen', 'dong-bang', 'doi'],
  rung: ['rung', 'rung', 'doi', 'dam-lay', 'dong-bang'],
  'dam-lay': ['dam-lay', 'song', 'dong-bang', 'rung'],
  nui: ['nui', 'nui', 'doi', 'rung'],
  bien: ['bien'],
};

// ---------------------------------------------------------------------------
// Ngẫu nhiên xác định
// ---------------------------------------------------------------------------

function bam(text) {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

/** mulberry32 — cùng seed thì cùng dãy, và dãy của id cha này không đụng id cha kia. */
function gieo(seedText) {
  let state = bam(seedText);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chon(random, rows) {
  return rows[Math.min(rows.length - 1, Math.floor(random() * rows.length))];
}

function trongKhoang(random, min, max) {
  return min + random() * (max - min);
}

// ---------------------------------------------------------------------------
// Nạp dữ liệu nguồn
// ---------------------------------------------------------------------------

const regionsFile = JSON.parse(readFileSync(path.join(root, 'data', 'regions.json'), 'utf8'));
const worldMapFile = JSON.parse(readFileSync(path.join(root, 'data', 'world-map.json'), 'utf8'));

const regions = regionsFile.regions ?? [];
const regionById = new Map(regions.map((row) => [row.id, row]));
const childrenOf = new Map();
for (const region of regions) {
  if (region.parentId === null || region.parentId === undefined) continue;
  const list = childrenOf.get(region.parentId) ?? [];
  list.push(region);
  childrenOf.set(region.parentId, list);
}

/** Toạ độ km và địa hình có sẵn của Phần 15 — chiến đồ mượn làm điểm neo. */
const neo = new Map((worldMapFile.nodes ?? []).map((node) => [node.id, node]));

const LON0 = -12;
const LAT0 = 62;
const KM_PER_LAT = 111;
const KM_PER_LON = 111 * Math.cos((50 * Math.PI) / 180);

function chieu(lat, lon) {
  return { x: Math.round((lon - LON0) * KM_PER_LON), y: Math.round((LAT0 - lat) * KM_PER_LAT) };
}

// ---------------------------------------------------------------------------
// Tên nơi chốn
// ---------------------------------------------------------------------------

const tenDaDung = new Set(regions.map((row) => row.name));

function sinhDiaDanh(random, khoId) {
  const kho = DIA_DANH[khoId] ?? DIA_DANH.frank;
  for (let lan = 0; lan < 40; lan++) {
    const pre = chon(random, kho.pre);
    const suf = chon(random, kho.suf);
    const ten = kho.ghepCach === true ? `${pre} ${suf}` : `${pre}${suf}`;
    if (!tenDaDung.has(ten)) {
      tenDaDung.add(ten);
      return ten;
    }
  }
  // Bốn chục lần trượt là kho đã cạn thật; đánh số thay vì lặp vô hạn.
  for (let so = 2; so < 99; so++) {
    const ten = `${chon(random, kho.pre)}${chon(random, kho.suf)} ${so}`;
    if (!tenDaDung.has(ten)) {
      tenDaDung.add(ten);
      return ten;
    }
  }
  throw new Error('không sinh nổi địa danh mới');
}

/** Bỏ tiền tố loại hình để "Thành phố Tự do Augsburg" thành "Augsburg". */
function tenTran(ten) {
  return ten
    .replace(/^(Thành phố Tự do|Thành phố|Thành|Trấn|Làng|Tỉnh|Vùng|Công quốc|Phiên hầu quốc|Bá quốc|Lãnh chúa quốc|Dãy|Rừng|Thảo nguyên)\s+/u, '')
    .trim();
}

// ---------------------------------------------------------------------------
// Hình học: nới lỏng cho hết chồng lấn
// ---------------------------------------------------------------------------

/**
 * Khe hở tối thiểu giữa hai nút, TÍNH THÊM ngoài hai bán kính.
 *
 * Nước và đảo được cộng thêm, đúng yêu cầu "biển xa nhau chút và đảo cũng vậy":
 * một ô biển sát bờ đọc như một tỉnh ven biển, còn một hòn đảo sát bờ đọc như
 * một bán đảo — cả hai đều làm người chơi tưởng có đường bộ.
 */
function kheHo(a, b, config) {
  if (a.water === true || b.water === true) return config.kheNuoc;
  if (a.island === true || b.island === true) return config.kheDao;
  return config.kheThuong;
}

/**
 * Đẩy các nút ra cho tới khi không cặp nào đè nhau, đồng thời kéo nhẹ mỗi nút về
 * chỗ địa lý thật của nó.
 *
 * Hai lực ngược nhau nên vòng cuối CHỈ đẩy, không kéo: nếu để lực kéo chạy tới
 * bước cuối thì luôn còn vài cặp chồng nhau vài pixel, và bài kiểm tra không
 * chồng lấn ở `campaign/data.ts` sẽ nổ ngay lúc khởi động.
 */
function noiLong(nodes, config) {
  const anchors = nodes.map((node) => ({ x: node.x, y: node.y }));
  // Nới quá yêu cầu một chút rồi mới làm tròn toạ độ: làm tròn có thể ăn mất tới
  // một đơn vị mỗi trục, và một khe hở thiếu 0,3 đơn vị vẫn là chồng lấn với bài
  // kiểm tra lúc khởi động.
  const bienAn = 2;

  for (let vong = 0; vong < config.vong; vong++) {
    const keo = vong < config.vong - config.vongCuoiChiDay ? config.keoVeNeo : 0;
    let lechLonNhat = 0;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const can = a.radius + b.radius + kheHo(a, b, config) + bienAn;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d < 1e-6) {
          // Hai nút trùng khít nhau (một tỉnh đặt đúng trên thành trì của nó):
          // chia theo chỉ số để hướng tách ra vẫn xác định.
          dx = Math.cos(i * 2.399963);
          dy = Math.sin(j * 2.399963);
          d = 1;
        }
        if (d >= can) continue;
        const day = ((can - d) / 2) * 0.85;
        const ux = dx / d;
        const uy = dy / d;
        a.x -= ux * day;
        a.y -= uy * day;
        b.x += ux * day;
        b.y += uy * day;
        lechLonNhat = Math.max(lechLonNhat, day);
      }
    }

    if (keo > 0) {
      for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index];
        const anchor = anchors[index];
        node.x += (anchor.x - node.x) * keo;
        node.y += (anchor.y - node.y) * keo;
      }
    } else if (lechLonNhat < 0.0005) {
      break;
    }
  }

  return nodes;
}

function conChongLan(nodes, config) {
  const xau = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const can = a.radius + b.radius + kheHo(a, b, config);
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d + 1e-6 < can) xau.push(`${a.id} ⟷ ${b.id} (thiếu ${(can - d).toFixed(1)})`);
    }
  }
  return xau;
}

// ---------------------------------------------------------------------------
// Cạnh: đồ thị Gabriel hợp với cây khung nhỏ nhất
// ---------------------------------------------------------------------------

/**
 * ĐỒ THỊ GABRIEL: nối a–b khi không nút thứ ba nào nằm trong hình tròn nhận ab
 * làm đường kính.
 *
 * Chọn nó thay vì "nối mọi cặp gần nhau" vì nó gần phẳng — rất ít cạnh cắt nhau
 * trên màn hình — mà vẫn cho ra mạng lưới nhiều ngã rẽ chứ không phải một chuỗi
 * hạt. Đó đúng là hình dáng mà một bản đồ chiến dịch cần: có đường vòng, nên
 * chặn một huyện không phải là chặn cả cuộc chiến.
 */
function canhGabriel(nodes) {
  const canh = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const r = Math.hypot(b.x - a.x, b.y - a.y) / 2;
      let bịChặn = false;
      for (let k = 0; k < nodes.length && !bịChặn; k++) {
        if (k === i || k === j) continue;
        const c = nodes[k];
        if (Math.hypot(c.x - mx, c.y - my) < r - 1e-9) bịChặn = true;
      }
      if (!bịChặn) canh.push([a.id, b.id]);
    }
  }
  return canh;
}

/** Cây khung nhỏ nhất theo khoảng cách — đảm bảo không nút nào bị bỏ rơi. */
function cayKhung(nodes) {
  if (nodes.length < 2) return [];
  const trong = new Set([nodes[0].id]);
  const viTri = new Map(nodes.map((node) => [node.id, node]));
  const canh = [];

  while (trong.size < nodes.length) {
    let tot = null;
    for (const id of trong) {
      const a = viTri.get(id);
      for (const b of nodes) {
        if (trong.has(b.id)) continue;
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (tot === null || d < tot.d) tot = { a: a.id, b: b.id, d };
      }
    }
    if (tot === null) break;
    trong.add(tot.b);
    canh.push([tot.a, tot.b]);
  }
  return canh;
}

function hopCanh(...danhSach) {
  const thay = new Set();
  const ra = [];
  for (const nhom of danhSach) {
    for (const [a, b] of nhom) {
      const khoa = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (thay.has(khoa)) continue;
      thay.add(khoa);
      ra.push([a, b]);
    }
  }
  return ra;
}

// ---------------------------------------------------------------------------
// Dựng tầng 1 — QUỐC GIA
// ---------------------------------------------------------------------------

/**
 * TOẠ ĐỘ HIỂN THỊ KHÔNG PHẢI TOẠ ĐỘ THẬT, và tách hai thứ ấy ra là bắt buộc.
 *
 * Mười một thành bang Ý nằm gọn trong một khoảng 300 km. Vẽ chúng đúng tỉ lệ thì
 * mười một cái đĩa chồng lên nhau thành một vũng, mà bản đồ này là bản đồ để
 * CLICK VÀO. Nên `x/y` được nới ra cho mắt đọc được, còn `gx/gy` giữ nguyên km
 * thật của `world-map.json` — và mọi con số km của cạnh đều đo trên `gx/gy`.
 * Nhờ vậy nới bản đồ ra cho dễ nhìn không làm quân đội đi chậm lại.
 */
const NOI_TANG1 = 1.7;

const CAU_HINH_TANG1 = { kheThuong: 46, kheNuoc: 130, kheDao: 96, keoVeNeo: 0.055, vong: 1400, vongCuoiChiDay: 500 };
const CAU_HINH_TANG2 = { kheThuong: 20, kheNuoc: 60, kheDao: 44, keoVeNeo: 0.05, vong: 700, vongCuoiChiDay: 220 };
const CAU_HINH_TANG3 = { kheThuong: 16, kheNuoc: 48, kheDao: 36, keoVeNeo: 0.05, vong: 700, vongCuoiChiDay: 220 };

/** Một đơn vị toạ độ tầng 2/3 đổi ra bao nhiêu km trên thực địa. */
const KM_MOI_DON_VI_TANG2 = 0.42;
const KM_MOI_DON_VI_TANG3 = 0.11;

const nodes = [];
const links = [];
const factions = [];

function themNut(node) {
  nodes.push(node);
  return node;
}

function themCanh(a, b, kind, gxA, gyA, gxB, gyB) {
  const km = Math.max(4, Math.round(Math.hypot(gxB - gxA, gyB - gyA)));
  links.push({ a, b, kind, km });
}

const quocGiaRegions = regions.filter((row) => row.kind === 'realm');
/** Ba vùng tự nhiên treo thẳng dưới lục địa: Alps, Carpathian, thảo nguyên. */
const hoangRegions = regions.filter((row) => row.kind === 'province' && row.parentId === 'reg_europa');

const tang1 = [];

for (const region of [...quocGiaRegions, ...hoangRegions]) {
  const anchor = neo.get(region.id);
  if (anchor === undefined) {
    console.error(`THIẾU NEO: ${region.id} không có toạ độ trong world-map.json`);
    process.exit(1);
  }
  const hoang = region.kind !== 'realm';
  const soCon = (childrenOf.get(region.id) ?? []).length;
  tang1.push({
    id: `qg_${region.id.replace(/^(realm|prov)_/u, '')}`,
    regionId: region.id,
    name: region.name,
    x: anchor.x * NOI_TANG1,
    y: anchor.y * NOI_TANG1,
    gx: anchor.x,
    gy: anchor.y,
    radius: Math.round(58 + 7 * Math.sqrt(soCon)),
    terrain: anchor.terrain,
    water: false,
    island: DAO.has(region.id),
    wild: hoang,
    roads: anchor.roads,
  });
}

for (const bien of BIEN) {
  const { x, y } = chieu(bien.lat, bien.lon);
  tang1.push({
    id: `qg_${bien.id}`,
    regionId: null,
    name: bien.name,
    x: x * NOI_TANG1,
    y: y * NOI_TANG1,
    gx: x,
    gy: y,
    radius: 88,
    terrain: 'bien',
    water: true,
    island: false,
    wild: true,
    roads: 0,
    coasts: bien.coasts,
  });
}

noiLong(tang1, CAU_HINH_TANG1);

const chongLan1 = conChongLan(tang1, CAU_HINH_TANG1);
if (chongLan1.length > 0) {
  console.error(`TẦNG 1 CÒN CHỒNG LẤN (${chongLan1.length}):\n  ${chongLan1.slice(0, 10).join('\n  ')}`);
  process.exit(1);
}

for (const node of tang1) {
  node.x = Math.round(node.x);
  node.y = Math.round(node.y);
}

const tang1ById = new Map(tang1.map((node) => [node.id, node]));
const tang1ByRegion = new Map(tang1.filter((node) => node.regionId !== null).map((node) => [node.regionId, node]));

// --- Màu của các phe -------------------------------------------------------

function mauTheoGocVang(index) {
  const hue = (index * 137.508) % 360;
  const sat = 42 + ((index * 17) % 18);
  const light = 38 + ((index * 11) % 14);
  return hslSangHex(hue, sat, light);
}

function hslSangHex(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (value) =>
    Math.round(255 * value)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

let chiSoMau = 0;
for (const node of tang1) {
  if (node.water || node.wild) continue;
  const region = node.regionId;
  const mau = MAU[region] ?? mauTheoGocVang((chiSoMau += 1));
  factions.push({
    id: `phe_${region.replace(/^realm_/u, '')}`,
    name: node.name,
    color: mau,
    homeNodeId: node.id,
  });
}

const pheCuaQuocGia = new Map(factions.map((phe) => [phe.homeNodeId, phe.id]));

// --- Cạnh tầng 1 -----------------------------------------------------------

const canhTang1 = [];
for (const region of [...quocGiaRegions, ...hoangRegions]) {
  const from = tang1ByRegion.get(region.id);
  for (const neighbourId of region.adjacent ?? []) {
    const to = tang1ByRegion.get(neighbourId);
    if (to === undefined || from.id >= to.id) continue;
    canhTang1.push([from.id, to.id]);
  }
}

/** Cạnh biển: mỗi vùng nước nối tới bờ của nó, và đó là đường duy nhất ra đảo. */
const canhBien = [];
for (const bien of BIEN) {
  const nuoc = tang1ById.get(`qg_${bien.id}`);
  for (const realmId of bien.coasts) {
    const bo = tang1ByRegion.get(realmId);
    if (bo === undefined) continue;
    canhBien.push([nuoc.id, bo.id]);
  }
}
/** Vùng nước kề nhau thì đi thuyền được từ vùng này sang vùng kia. */
const NUOC_NOI_NUOC = [
  ['bien-bac', 'bien-baltic'],
  ['bien-bac', 'bien-manche'],
  ['bien-bac', 'bien-ireland'],
  ['bien-manche', 'bien-ireland'],
  ['bien-manche', 'bien-biscay'],
  ['bien-biscay', 'bien-dai-tay-duong'],
  ['bien-dai-tay-duong', 'bien-tay-dia-trung-hai'],
  ['bien-tay-dia-trung-hai', 'bien-tyrrhenian'],
  ['bien-tyrrhenian', 'bien-adriatic'],
  ['bien-tyrrhenian', 'bien-aegean'],
  ['bien-adriatic', 'bien-aegean'],
  ['bien-aegean', 'bien-hac-hai'],
  ['bien-hac-hai', 'bien-caspi'],
  ['bien-ireland', 'bien-dai-tay-duong'],
];
for (const [a, b] of NUOC_NOI_NUOC) canhBien.push([`qg_${a}`, `qg_${b}`]);

const canhKhungTang1 = cayKhung(tang1.filter((node) => !node.water));

for (const [a, b] of hopCanh(canhTang1, canhBien, canhKhungTang1)) {
  const from = tang1ById.get(a);
  const to = tang1ById.get(b);
  const kind = from.water || to.water ? 'duong-bien' : from.terrain === 'nui' || to.terrain === 'nui' ? 'duong-nui' : 'duong-bo';
  themCanh(a, b, kind, from.gx, from.gy, to.gx, to.gy);
}

for (const node of tang1) {
  themNut({
    id: node.id,
    name: node.name,
    level: 1,
    parentId: null,
    regionId: node.regionId,
    x: node.x,
    y: node.y,
    gx: node.gx,
    gy: node.gy,
    radius: node.radius,
    terrain: node.terrain,
    water: node.water,
    island: node.island,
    site: '',
    siteName: '',
    fort: 0,
    seat: false,
    ownerId: pheCuaQuocGia.get(node.id) ?? '',
  });
}

// ---------------------------------------------------------------------------
// Dựng tầng 2 — VÙNG LỚN, và tầng 3 — HUYỆN
// ---------------------------------------------------------------------------

/**
 * Đưa một chùm toạ độ về giữa hộp 0…1000 mà vẫn giữ tỉ lệ hình.
 *
 * `khongThuNho` là chốt an toàn cho lần gọi SAU khi nới lỏng: thu nhỏ một bố cục
 * đã hết chồng lấn thì các khe hở co lại theo, và bài kiểm tra ở
 * `campaign/data.ts` sẽ nổ. Lần gọi trước khi nới lỏng thì thu nhỏ thoải mái.
 */
function veHopVuong(rows, lePhai = 120, khongThuNho = false) {
  if (rows.length === 0) return;
  const xs = rows.map((row) => row.x);
  const ys = rows.map((row) => row.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rong = Math.max(1, maxX - minX);
  const cao = Math.max(1, maxY - minY);
  let heSo = Math.min((1000 - 2 * lePhai) / rong, (1000 - 2 * lePhai) / cao);
  if (khongThuNho) heSo = Math.max(1, heSo);
  for (const row of rows) {
    row.x = Math.round(500 + (row.x - (minX + maxX) / 2) * heSo);
    row.y = Math.round(500 + (row.y - (minY + maxY) / 2) * heSo);
  }
}

/** Rải đều quanh một vòng tròn, lệch nhẹ theo seed để không ra hình ngôi sao. */
function raiVongTron(random, count, index, banKinh) {
  const goc = (index / Math.max(1, count)) * Math.PI * 2 + random() * 0.5;
  const r = banKinh * trongKhoang(random, 0.72, 1.05);
  return { x: 500 + Math.cos(goc) * r, y: 500 + Math.sin(goc) * r };
}

const tang2ByParent = new Map();
const tang3ByParent = new Map();

for (const cha of tang1) {
  const random = gieo(`vung|${cha.id}`);
  const khoTen = VAN_HOA[cha.regionId ?? ''] ?? 'frank';

  /** Nước: một vùng biển con duy nhất, để hạm đội vẫn có ô để đứng. */
  if (cha.water) {
    const con = [
      {
        id: `vung_${cha.id.replace(/^qg_/u, '')}`,
        regionId: null,
        name: cha.name,
        x: 500,
        y: 500,
        radius: 120,
        terrain: 'bien',
        water: true,
        island: false,
        seat: true,
      },
    ];
    tang2ByParent.set(cha.id, con);
    continue;
  }

  const conThat = (childrenOf.get(cha.regionId) ?? []).filter((row) => row.kind === 'province');
  const rows = [];

  for (const region of conThat) {
    const anchor = neo.get(region.id);
    rows.push({
      id: `vung_${region.id.replace(/^prov_/u, '')}`,
      regionId: region.id,
      name: region.name,
      x: anchor?.x ?? cha.gx + trongKhoang(random, -60, 60),
      y: anchor?.y ?? cha.gy + trongKhoang(random, -60, 60),
      radius: 78,
      terrain: anchor?.terrain ?? cha.terrain,
      water: false,
      island: cha.island,
      seat: false,
      thatSu: true,
    });
  }

  const canCo = Math.max(VUNG_TOI_THIEU, SO_VUNG[cha.regionId] ?? VUNG_TOI_THIEU);
  const thieu = Math.max(0, canCo - rows.length);
  for (let index = 0; index < thieu; index++) {
    const ten = sinhDiaDanh(random, khoTen);
    const noi = raiVongTron(random, thieu, index, 300);
    rows.push({
      id: `vung_${cha.id.replace(/^qg_/u, '')}-${index + 1}`,
      regionId: null,
      name: ten,
      x: cha.gx + (noi.x - 500) * 0.55,
      y: cha.gy + (noi.y - 500) * 0.55,
      radius: 78,
      terrain: chon(random, DIA_HINH_LAN_CAN[cha.terrain] ?? ['dong-bang']),
      water: false,
      island: cha.island,
      seat: false,
      thatSu: false,
    });
  }

  veHopVuong(rows);
  noiLong(rows, CAU_HINH_TANG2);
  veHopVuong(rows, 90, true);

  const chongLan2 = conChongLan(rows, CAU_HINH_TANG2);
  if (chongLan2.length > 0) {
    console.error(`VÙNG CỦA ${cha.id} CÒN CHỒNG LẤN:\n  ${chongLan2.join('\n  ')}`);
    process.exit(1);
  }

  // Thủ phủ: vùng gần tâm nhất, và nó là vùng cuối cùng đổ khi bị chinh phục.
  let thuPhu = rows[0];
  for (const row of rows) {
    if (Math.hypot(row.x - 500, row.y - 500) < Math.hypot(thuPhu.x - 500, thuPhu.y - 500)) thuPhu = row;
  }
  thuPhu.seat = true;

  tang2ByParent.set(cha.id, rows);
}

/** Toạ độ toàn cục của một vùng: tâm quốc gia cộng độ lệch đã thu nhỏ. */
for (const [chaId, rows] of tang2ByParent) {
  const cha = tang1ById.get(chaId);
  for (const row of rows) {
    row.gx = Math.round(cha.gx + (row.x - 500) * KM_MOI_DON_VI_TANG2);
    row.gy = Math.round(cha.gy + (row.y - 500) * KM_MOI_DON_VI_TANG2);
  }
}

// --- Huyện -----------------------------------------------------------------

/**
 * Thành trì thật của `regions.json` treo ở đâu thì về đúng vùng ấy.
 *
 * Nhiều thành trì lại treo THẲNG dưới quốc gia (Granada có Alhambra và Gibraltar
 * mà không có tỉnh nào ở giữa). Chúng được gả vào vùng gần nhất theo toạ độ thật
 * — gần nhất chứ không phải vùng đầu tiên, nếu không thì Gibraltar sẽ nằm trong
 * cùng một vùng với Alhambra chỉ vì thứ tự khai báo.
 */
function thanhTriCuaVung(cha, rowsTang2) {
  const theoVung = new Map(rowsTang2.map((row) => [row.id, []]));

  const nap = (holds, vungId) => {
    for (const hold of holds) theoVung.get(vungId)?.push(hold);
  };

  for (const row of rowsTang2) {
    if (row.regionId === null) continue;
    nap(
      (childrenOf.get(row.regionId) ?? []).filter((child) => child.kind === 'settlement'),
      row.id,
    );
  }

  const treoThangDuoiQuocGia = (childrenOf.get(cha.regionId) ?? []).filter((child) => child.kind === 'settlement');
  for (const hold of treoThangDuoiQuocGia) {
    const anchor = neo.get(hold.id);
    let gan = rowsTang2[0];
    if (anchor !== undefined) {
      for (const row of rowsTang2) {
        if (Math.hypot(row.gx - anchor.x, row.gy - anchor.y) < Math.hypot(gan.gx - anchor.x, gan.gy - anchor.y)) gan = row;
      }
    }
    theoVung.get(gan.id)?.push(hold);
  }

  return theoVung;
}

for (const [chaId, rowsTang2] of tang2ByParent) {
  const quocGia = tang1ById.get(chaId);
  const khoTen = VAN_HOA[quocGia.regionId ?? ''] ?? 'frank';
  const holdTheoVung = quocGia.water ? new Map() : thanhTriCuaVung(quocGia, rowsTang2);

  for (const vung of rowsTang2) {
    const random = gieo(`huyen|${vung.id}`);

    if (vung.water) {
      const rows = [];
      for (let index = 0; index < 3; index++) {
        const noi = raiVongTron(random, 3, index, 260);
        rows.push({
          id: `huyen_${vung.id.replace(/^vung_/u, '')}-${index + 1}`,
          regionId: null,
          name: `${vung.name} ${['tây', 'giữa', 'đông'][index]}`,
          x: noi.x,
          y: noi.y,
          radius: 58,
          terrain: 'bien',
          water: true,
          island: false,
          site: '',
          siteName: '',
          fort: 0,
          seat: index === 1,
        });
      }
      noiLong(rows, CAU_HINH_TANG3);
      for (const row of rows) {
        row.x = Math.round(row.x);
        row.y = Math.round(row.y);
        row.gx = Math.round(vung.gx + (row.x - 500) * KM_MOI_DON_VI_TANG3);
        row.gy = Math.round(vung.gy + (row.y - 500) * KM_MOI_DON_VI_TANG3);
      }
      tang3ByParent.set(vung.id, rows);
      continue;
    }

    const holds = holdTheoVung.get(vung.id) ?? [];
    const rows = [];

    for (const hold of holds) {
      const anchor = neo.get(hold.id);
      const ten = hold.name;
      const laLang = /^Làng/u.test(ten);
      const laTran = /^(Trấn|Thành phố)/u.test(ten);
      rows.push({
        id: `huyen_${hold.id.replace(/^hold_/u, '')}`,
        regionId: hold.id,
        name: ten,
        x: anchor?.x ?? vung.gx,
        y: anchor?.y ?? vung.gy,
        radius: 52,
        terrain: anchor?.terrain ?? vung.terrain,
        water: false,
        island: DAO.has(hold.id),
        site: laLang ? 'lang' : laTran ? 'thi-tran' : 'thanh-tri',
        siteName: ten,
        fort: laLang ? 0 : laTran ? 2 : 4,
        seat: false,
        thatSu: true,
      });
    }

    // Số huyện thay đổi theo seed chứ không cố định: một chiến dịch mà vùng nào
    // cũng đúng ba ô thì người chơi học thuộc trong mười phút và không bao giờ
    // phải nhìn bản đồ nữa.
    const canCo = Math.min(HUYEN_MAX, Math.max(HUYEN_MIN + Math.floor(random() * 3), rows.length + 1));
    const thieu = Math.max(0, canCo - rows.length);
    for (let index = 0; index < thieu; index++) {
      const ten = sinhDiaDanh(random, khoTen);
      const noi = raiVongTron(random, thieu, index, 290);
      rows.push({
        id: `huyen_${vung.id.replace(/^vung_/u, '')}-${index + 1}`,
        regionId: null,
        name: `Huyện ${ten}`,
        x: vung.gx + (noi.x - 500) * 0.16,
        y: vung.gy + (noi.y - 500) * 0.16,
        radius: 52,
        terrain: chon(random, DIA_HINH_LAN_CAN[vung.terrain] ?? ['dong-bang']),
        water: false,
        island: vung.island,
        site: '',
        siteName: '',
        fort: 0,
        seat: false,
        thatSu: false,
        tenTran: ten,
      });
    }

    // MỖI VÙNG PHẢI CÓ ÍT NHẤT MỘT THÀNH TRÌ, nếu không thì nó không bao giờ đổ:
    // luật chinh phục đòi hạ hết thành trì và thị trấn, mà một tập rỗng thì hạ
    // xong ngay từ lượt đầu — vùng ấy sẽ tự rơi vào tay bất cứ ai đi ngang.
    if (!rows.some((row) => row.site === 'thanh-tri')) {
      const chuaCoDiem = rows.filter((row) => row.site === '');
      const nhan = chuaCoDiem[0] ?? rows[0];
      nhan.site = 'thanh-tri';
      nhan.fort = 3 + Math.floor(random() * 2);
      nhan.siteName = `Thành ${nhan.tenTran ?? tenTran(nhan.name)}`;
    }

    // Thị trấn: một hoặc hai, phần còn lại là làng không có mục tiêu quân sự.
    const conTrong = rows.filter((row) => row.site === '');
    const soThiTran = Math.min(conTrong.length, 1 + Math.floor(random() * 2));
    for (let index = 0; index < conTrong.length; index++) {
      const row = conTrong[index];
      if (index < soThiTran) {
        row.site = 'thi-tran';
        row.fort = 1 + Math.floor(random() * 2);
        row.siteName = `Trấn ${row.tenTran ?? tenTran(row.name)}`;
      } else {
        row.site = 'lang';
        row.fort = 0;
        row.siteName = `Làng ${row.tenTran ?? tenTran(row.name)}`;
      }
    }

    veHopVuong(rows);
    noiLong(rows, CAU_HINH_TANG3);
    veHopVuong(rows, 80, true);

    const chongLan3 = conChongLan(rows, CAU_HINH_TANG3);
    if (chongLan3.length > 0) {
      console.error(`HUYỆN CỦA ${vung.id} CÒN CHỒNG LẤN:\n  ${chongLan3.join('\n  ')}`);
      process.exit(1);
    }

    // Huyện lỵ: thành trì mạnh nhất. Đây là nơi chủ vùng ngồi, và trên màn hình
    // nó là cái mỏ neo để người chơi biết mình đang nhìn vào vùng nào.
    let ly = rows[0];
    for (const row of rows) if (row.fort > ly.fort) ly = row;
    ly.seat = true;

    for (const row of rows) {
      row.gx = Math.round(vung.gx + (row.x - 500) * KM_MOI_DON_VI_TANG3);
      row.gy = Math.round(vung.gy + (row.y - 500) * KM_MOI_DON_VI_TANG3);
      delete row.tenTran;
      delete row.thatSu;
    }

    tang3ByParent.set(vung.id, rows);
  }
}

// ---------------------------------------------------------------------------
// Ghi nút tầng 2 và 3, rồi nối cạnh
// ---------------------------------------------------------------------------

const tatCaTang2 = [];
const tatCaTang3 = [];

for (const [chaId, rows] of tang2ByParent) {
  const cha = tang1ById.get(chaId);
  const chuSoHuu = pheCuaQuocGia.get(chaId) ?? '';
  for (const row of rows) {
    const node = {
      id: row.id,
      name: row.name,
      level: 2,
      parentId: chaId,
      regionId: row.regionId,
      x: row.x,
      y: row.y,
      gx: row.gx,
      gy: row.gy,
      radius: row.radius,
      terrain: row.terrain,
      water: row.water === true,
      island: row.island === true,
      site: '',
      siteName: '',
      fort: 0,
      seat: row.seat === true,
      ownerId: row.water === true ? '' : chuSoHuu,
    };
    themNut(node);
    tatCaTang2.push(node);
  }
}

for (const [vungId, rows] of tang3ByParent) {
  const vung = tatCaTang2.find((node) => node.id === vungId);
  for (const row of rows) {
    const node = {
      id: row.id,
      name: row.name,
      level: 3,
      parentId: vungId,
      regionId: row.regionId,
      x: row.x,
      y: row.y,
      gx: row.gx,
      gy: row.gy,
      radius: row.radius,
      terrain: row.terrain,
      water: row.water === true,
      island: row.island === true,
      site: row.site,
      siteName: row.siteName,
      fort: row.fort,
      seat: row.seat === true,
      ownerId: row.water === true ? '' : vung.ownerId,
    };
    themNut(node);
    tatCaTang3.push(node);
  }
}

const nodeById = new Map(nodes.map((node) => [node.id, node]));

/** Cạnh trong lòng một cha: Gabriel hợp cây khung, tính trên toạ độ cục bộ. */
function noiAnhEm(rows) {
  if (rows.length < 2) return;
  for (const [a, b] of hopCanh(canhGabriel(rows), cayKhung(rows))) {
    const from = nodeById.get(a);
    const to = nodeById.get(b);
    const kind = from.water || to.water ? 'duong-bien' : from.terrain === 'nui' || to.terrain === 'nui' ? 'duong-nui' : 'duong-bo';
    themCanh(a, b, kind, from.gx, from.gy, to.gx, to.gy);
  }
}

for (const rows of tang2ByParent.values()) noiAnhEm(rows.map((row) => nodeById.get(row.id)));
for (const rows of tang3ByParent.values()) noiAnhEm(rows.map((row) => nodeById.get(row.id)));

/**
 * CỬA NGÕ — cạnh nối hai cha khác nhau.
 *
 * Không có chúng thì đồ thị tầng 3 vỡ thành tám trăm ốc đảo và không đạo quân
 * nào rời khỏi tỉnh của mình được. Hai vùng kề nhau thì cặp huyện GẦN NHAU NHẤT
 * của chúng có một con đường — đúng như thực địa: người ta không băng qua biên
 * giới ở giữa đồng mà đi qua cái đèo hoặc cái cầu gần nhất.
 */
function cuaNgo(conA, conB) {
  let tot = null;
  for (const a of conA) {
    for (const b of conB) {
      const d = Math.hypot(b.gx - a.gx, b.gy - a.gy);
      if (tot === null || d < tot.d) tot = { a, b, d };
    }
  }
  return tot;
}

const canhTang1DaCo = links.filter((link) => nodeById.get(link.a)?.level === 1);
for (const link of canhTang1DaCo) {
  const conA = (tang2ByParent.get(link.a) ?? []).map((row) => nodeById.get(row.id));
  const conB = (tang2ByParent.get(link.b) ?? []).map((row) => nodeById.get(row.id));
  const cua = cuaNgo(conA, conB);
  if (cua === null) continue;
  themCanh(cua.a.id, cua.b.id, link.kind, cua.a.gx, cua.a.gy, cua.b.gx, cua.b.gy);
}

const canhTang2DaCo = links.filter((link) => nodeById.get(link.a)?.level === 2);
for (const link of canhTang2DaCo) {
  const conA = (tang3ByParent.get(link.a) ?? []).map((row) => nodeById.get(row.id));
  const conB = (tang3ByParent.get(link.b) ?? []).map((row) => nodeById.get(row.id));
  const cua = cuaNgo(conA, conB);
  if (cua === null) continue;
  themCanh(cua.a.id, cua.b.id, link.kind, cua.a.gx, cua.a.gy, cua.b.gx, cua.b.gy);
}

/** Huyện đầu một cạnh biển là CẢNG: chỗ duy nhất lên thuyền được. */
for (const link of links) {
  if (link.kind !== 'duong-bien') continue;
  const a = nodeById.get(link.a);
  const b = nodeById.get(link.b);
  if (a?.level !== 3 || b?.level !== 3) continue;
  if (!a.water) a.port = true;
  if (!b.water) b.port = true;
}

// ---------------------------------------------------------------------------
// Kiểm tra trước khi ghi
// ---------------------------------------------------------------------------

const loi = [];

const dem = new Map();
for (const node of nodes) dem.set(node.id, (dem.get(node.id) ?? 0) + 1);
for (const [id, so] of dem) if (so > 1) loi.push(`id trùng: ${id} (${so} lần)`);

for (const node of nodes) {
  if (node.level === 1 && node.parentId !== null) loi.push(`${node.id}: tầng 1 mà có cha`);
  if (node.level > 1) {
    const cha = nodeById.get(node.parentId);
    if (cha === undefined) loi.push(`${node.id}: cha ${node.parentId} không tồn tại`);
    else if (cha.level !== node.level - 1) loi.push(`${node.id}: cha sai tầng`);
  }
}

for (const link of links) {
  const a = nodeById.get(link.a);
  const b = nodeById.get(link.b);
  if (a === undefined || b === undefined) {
    loi.push(`cạnh treo: ${link.a} → ${link.b}`);
    continue;
  }
  if (a.level !== b.level) loi.push(`cạnh chéo tầng: ${link.a} → ${link.b}`);
}

/** Mỗi vùng phải có ít nhất một thành trì, nếu không nó không bao giờ đổ. */
for (const vung of tatCaTang2) {
  if (vung.water) continue;
  const con = tatCaTang3.filter((node) => node.parentId === vung.id);
  if (!con.some((node) => node.site === 'thanh-tri')) loi.push(`${vung.id} (${vung.name}) không có thành trì nào`);
}

/** Đồ thị tầng 3 phải liền một khối — trừ các đảo, chúng nối qua đường biển. */
const keTang3 = new Map();
for (const link of links) {
  const a = nodeById.get(link.a);
  if (a?.level !== 3) continue;
  (keTang3.get(link.a) ?? keTang3.set(link.a, []).get(link.a)).push(link.b);
  (keTang3.get(link.b) ?? keTang3.set(link.b, []).get(link.b)).push(link.a);
}
const daTham = new Set();
const hangDoi = [tatCaTang3[0]?.id].filter((id) => id !== undefined);
while (hangDoi.length > 0) {
  const id = hangDoi.pop();
  if (daTham.has(id)) continue;
  daTham.add(id);
  for (const ke of keTang3.get(id) ?? []) if (!daTham.has(ke)) hangDoi.push(ke);
}
if (daTham.size !== tatCaTang3.length) {
  const roiRac = tatCaTang3.filter((node) => !daTham.has(node.id)).slice(0, 12);
  loi.push(`đồ thị huyện vỡ thành nhiều mảnh: ${tatCaTang3.length - daTham.size} huyện không tới được, ví dụ ${roiRac.map((n) => n.id).join(', ')}`);
}

if (loi.length > 0) {
  console.error(`CHIẾN ĐỒ KHÔNG HỢP LỆ (${loi.length} lỗi):\n  ${loi.slice(0, 25).join('\n  ')}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Ghi file
// ---------------------------------------------------------------------------

const output = {
  $schema: './campaign-map.schema.json',
  $comment:
    'CHIẾN ĐỒ BA TẦNG — bản đồ CHINH PHỤC, khác hẳn world-map.json vốn chỉ để đo đường đi. SINH TỰ ĐỘNG bởi tools/tao-chien-do.mjs, đừng sửa tay: sửa bảng trong script ấy rồi chạy lại. Ba tầng: qg_ quốc gia > vung_ vùng lớn > huyen_ huyện. CHỈ TẦNG HUYỆN có mục tiêu chiếm được (thành trì và thị trấn); vùng và quốc gia đổ khi mọi mục tiêu bên trong đã đổi chủ hoặc chủ của chúng chịu làm chư hầu. Toạ độ x/y là toạ độ CỤC BỘ trong khung 0…1000 của nút cha (tầng 1 dùng km như world-map.json), gx/gy là toạ độ TOÀN CỤC tính bằng km — cạnh nào cũng đo km trên gx/gy. Mọi cặp nút anh em đã được nới cho hết chồng lấn; src/systems/campaign/data.ts kiểm lại lúc khởi động.',
  version: 1,
  config: {
    $comment:
      '`spacing` là khe hở tối thiểu mà bài kiểm tra chồng lấn dùng lại — biển và đảo được cộng thêm để không ai tưởng có đường bộ ra đảo. `march` là tốc độ hành quân: quân KHÔNG BAO GIỜ nhảy từ ô này sang ô kia, nó bò trên cạnh theo km mỗi ngày.',
    levels: [
      { level: 1, id: 'quoc-gia', name: 'Quốc gia', prefix: 'qg_' },
      { level: 2, id: 'vung', name: 'Vùng lớn', prefix: 'vung_' },
      { level: 3, id: 'huyen', name: 'Huyện', prefix: 'huyen_' },
    ],
    spacing: {
      1: { thuong: CAU_HINH_TANG1.kheThuong, nuoc: CAU_HINH_TANG1.kheNuoc, dao: CAU_HINH_TANG1.kheDao },
      2: { thuong: CAU_HINH_TANG2.kheThuong, nuoc: CAU_HINH_TANG2.kheNuoc, dao: CAU_HINH_TANG2.kheDao },
      3: { thuong: CAU_HINH_TANG3.kheThuong, nuoc: CAU_HINH_TANG3.kheNuoc, dao: CAU_HINH_TANG3.kheDao },
    },
    terrain: DIA_HINH,
    linkKind: {
      'duong-bo': { name: 'Đường bộ', speed: 1.0, needsShip: false },
      'duong-nui': { name: 'Đường núi', speed: 0.55, needsShip: false },
      'duong-song': { name: 'Đường sông', speed: 1.1, needsShip: false },
      'duong-bien': { name: 'Đường biển', speed: 0.95, needsShip: true },
    },
    site: {
      'thanh-tri': { name: 'Thành trì', objective: true, siegeWeeks: 6, note: 'Phải vây hoặc tổng công mới lấy được.' },
      'thi-tran': { name: 'Thị trấn', objective: true, siegeWeeks: 2, note: 'Tường thấp: chiếm được bằng cách đóng quân.' },
      lang: { name: 'Làng', objective: false, siegeWeeks: 0, note: 'Đi qua là xong, không tính vào điều kiện chiếm vùng.' },
    },
    march: {
      kmPerDayFoot: 22,
      kmPerDayHorse: 38,
      kmPerDaySea: 90,
      seasonFactor: { xuan: 1.0, ha: 1.1, thu: 0.95, dong: 0.6 },
      $comment:
        'Một đạo quân đứng cách thành ba ngày đường thì trên chiến đồ nó phải NẰM Ở GIỮA hai ô, không phải đã ở cổng thành. Đó là lý do march giữ legIndex và legProgress thay vì một ô duy nhất.',
    },
    conquest: {
      $comment:
        'ĐIỀU KIỆN ĐỔ CỦA MỘT TẦNG. Chiếm hết mục tiêu bên trong, HOẶC chủ của nó chịu làm chư hầu — hai đường, cùng một kết quả trên bản đồ là đổi màu.',
      needAllObjectives: true,
      vassalCountsAsHeld: true,
      occupyDaysTown: 3,
      seatFallsLast: true,
    },
  },
  factions,
  nodes: nodes.sort((left, right) => left.level - right.level || left.id.localeCompare(right.id)),
  links: links.sort((left, right) => left.a.localeCompare(right.a) || left.b.localeCompare(right.b)),
};

writeFileSync(path.join(root, 'data', 'campaign-map.json'), `${JSON.stringify(output, null, 1)}\n`, 'utf8');

const demTang = [1, 2, 3].map((level) => nodes.filter((node) => node.level === level).length);
const demMucTieu = nodes.filter((node) => node.site === 'thanh-tri' || node.site === 'thi-tran').length;
console.log(
  `Đã ghi data/campaign-map.json — ${String(demTang[0])} quốc gia, ${String(demTang[1])} vùng, ${String(demTang[2])} huyện; ` +
    `${String(demMucTieu)} mục tiêu chiếm được, ${String(links.length)} cạnh, ${String(factions.length)} phe.`,
);
