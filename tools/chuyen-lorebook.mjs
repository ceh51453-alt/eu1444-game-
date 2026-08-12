/**
 * CHUYỂN "châu âu 1444.json" (World Info của SillyTavern) SANG ĐỊNH DẠNG CỦA GAME.
 *
 *   node tools/chuyen-lorebook.mjs
 *
 * Vì sao là script chứ không sửa tay: 264 entry, và bản gốc còn được sửa tiếp.
 * Mọi phép biến đổi ở đây đều KHÔNG MẤT MÁT — không cắt chữ nào của người viết,
 * chỉ thêm field, đổi từ vựng bị cấm, và dọn từ khóa quá rộng. Chạy lại lúc nào
 * cũng ra đúng kết quả cũ.
 *
 * Bảy việc nó làm:
 *   1. Đặt id theo quy ước mục 2 (race_* nation_* hold_* npc_* …), thay cho 1..264
 *   2. Sinh `summary` cho mọi entry — bản lui khi hết ngân sách khối 4
 *   3. Sửa từ vựng bị cấm ("lãnh địa") và từ ngữ hiện đại ("hệ thống", "năng lượng"…)
 *   4. Bỏ những từ khóa rộng tới mức entry vào mọi lượt (mục 4.2)
 *   5. XẺ mỗi entry nhân vật thành ba tầng tri thức public / gated / secret (mục 8)
 *   6. Nối `related` giữa nhân vật ↔ địa danh ↔ thế lực (mục 7)
 *   7. Gắn `variants` viết tay trong `tools/bien-the.json` vào đúng entry (mục 6)
 *
 * Nó KHÔNG đụng tới nội dung chủng tộc: theo yêu cầu, phần chủng tộc được chỉnh
 * ở phía game (`data/races.json`), không chỉnh trong sách.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const ROOT = join(TOOLS, '..');
const NGUON = join(ROOT, 'châu âu 1444.json');
const DICH = join(ROOT, 'lorebooks');
const VUNG = JSON.parse(readFileSync(join(ROOT, 'data', 'regions.json'), 'utf8')).regions;
const BIEN_THE = JSON.parse(readFileSync(join(TOOLS, 'bien-the.json'), 'utf8'));

// ---------------------------------------------------------------------------
// 1. TỪ VỰNG — mục 12 của hướng dẫn
// ---------------------------------------------------------------------------

/**
 * Thay theo THỨ TỰ, cụm dài trước cụm ngắn.
 *
 * "lãnh địa" bị cấm tuyệt đối vì tiếng Việt dùng nó cho cả THÀNH TRÌ, LÃNH THỔ
 * lẫn THÁI ẤP. Không thay máy móc thành một từ: mỗi chỗ nó đang mang một nghĩa
 * khác, nên tên riêng được thay đúng tên riêng trước, generic mới rơi xuống
 * "lãnh thổ" — tầng đúng cho gần như mọi chỗ còn lại.
 */
const TU_VUNG = [
  // --- tên riêng có chứa từ cấm ---
  ['Hệ thống Lãnh địa Đế quốc', 'Đẳng cấp Đế quốc'],
  ['Lãnh địa Đế quốc', 'Đẳng cấp Đế quốc'],
  ['lãnh địa Đế quốc', 'đẳng cấp Đế quốc'],
  ['Lãnh địa Giáo hoàng', 'Quốc gia Giáo hoàng'],
  ['lãnh địa Giáo hoàng', 'Quốc gia Giáo hoàng'],
  ['Lãnh địa Áo', 'Công quốc Áo'],
  ['lãnh địa Áo', 'Công quốc Áo'],
  ['Lãnh địa Avignon', 'Lãnh thổ Avignon'],
  ['Lãnh địa Morea', 'Vương công quốc Morea'],
  ['lãnh địa Morea', 'Vương công quốc Morea'],
  ['Lãnh địa Provence', 'Lãnh thổ Provence'],
  ['Lãnh địa Mainz', 'Lãnh thổ Mainz'],
  ['Lãnh địa Trier', 'Lãnh thổ Trier'],
  ['Lãnh địa Cologne', 'Lãnh thổ Cologne'],
  ['Lãnh địa Palatinate', 'Lãnh thổ Palatinate'],
  ['Lãnh địa Brandenburg', 'Lãnh thổ Brandenburg'],
  ['Lãnh địa Saxony', 'Lãnh thổ Saxony'],
  ['Lãnh địa Bavaria', 'Lãnh thổ Bavaria'],
  ['Lãnh địa Württemberg', 'Lãnh thổ Württemberg'],
  ['lãnh địa Württemberg', 'lãnh thổ Württemberg'],
  ['Lãnh địa Transylvania', 'vùng Transylvania'],
  ['lãnh địa Transylvania', 'vùng Transylvania'],
  // --- generic ---
  ['Lãnh địa', 'Lãnh thổ'],
  ['lãnh địa', 'lãnh thổ'],

  // --- từ ngữ hiện đại, mục 12.3 ---
  ['cung cấp năng lượng cho', 'tiếp ma lực cho'],
  ['năng lượng tử linh', 'ma lực tử linh'],
  ['dòng chảy năng lượng tự nhiên', 'dòng chảy ma lực tự nhiên'],
  ['truyền năng lượng qua', 'truyền ma lực qua'],
  ['năng lượng địa nhiệt', 'hơi nóng lòng đất'],
  ['hấp thụ năng lượng sống', 'hấp thụ sinh khí'],
  ['nạp lại năng lượng', 'lấy lại sức'],
  ['năng lượng của đất trời', 'sinh khí của đất trời'],
  ['năng lượng', 'ma lực'],
  ['hiệu suất công phá', 'sức công phá'],
  ['tối ưu hóa triệt để', 'khai thác triệt để'],
  ['tối ưu hóa', 'khai thác'],
  ['một phần trăm lợi nhuận khổng lồ', 'một phần lợi nhuận khổng lồ'],
  ['một phần trăm khổng lồ', 'một phần khổng lồ'],
  ['một tỷ lệ phần trăm giá trị hàng hóa', 'một phần trong giá trị hàng hóa'],
  ['phần trăm', 'phần'],
  ['Công ty quân sự tư nhân', 'Đại đội quân sự tư nhân'],
  ['công ty quân sự tư nhân', 'đại đội quân sự tư nhân'],
  ['các công ty quân sự', 'các đại đội quân sự'],
  ['tư duy chiến tranh hiện đại', 'lối nghĩ về chiến tranh'],
  ['Công nghệ', 'Kỹ nghệ'],
  ['công nghệ', 'kỹ nghệ'],
  ['dữ liệu', 'sổ sách'],

  // --- "hệ thống": cụ thể trước, tổng quát sau ---
  ['Hệ thống Hành chính Nhà nước Dòng tu', 'Bộ máy Nhà nước Dòng tu'],
  ['Hệ thống Hành chính Hoàng gia Pháp', 'Bộ máy Hành chính Hoàng gia Pháp'],
  ['Hệ thống Lính đánh thuê', 'Lề lối Lính đánh thuê'],
  ['hệ thống lính đánh thuê', 'lề lối lính đánh thuê'],
  ['Hệ thống Pháo đài', 'Mạng lưới Pháo đài'],
  ['hệ thống pháo đài', 'mạng lưới pháo đài'],
  ['Hệ thống Thái ấp', 'Chế độ Thái ấp'],
  ['hệ thống thái ấp', 'chế độ thái ấp'],
  ['Hệ thống Hội đồng', 'Lề lối Hội đồng'],
  ['hệ thống hội đồng', 'lề lối hội đồng'],
  ['Hệ thống Nghĩa vụ', 'Chế độ Nghĩa vụ'],
  ['Hệ thống Điền trang', 'Chế độ Điền trang'],
  ['hệ thống điền trang', 'chế độ điền trang'],
  ['Hệ thống Khai khoáng', 'Nghiệp Khai khoáng'],
  ['Hệ thống Tự trị', 'Chế độ Tự trị'],
  ['Hệ thống Lãnh chúa', 'Chế độ Lãnh chúa'],
  ['Hệ thống Bang Thụy Sĩ', 'Chế độ Bang Thụy Sĩ'],
  ['Hệ thống Ngân hàng', 'Mạng lưới Ngân hàng'],
  ['hệ thống ngân hàng', 'mạng lưới ngân hàng'],
  ['Hệ thống Giao dịch', 'Lối Giao dịch'],
  ['Hệ thống Thuế khóa', 'Phép Thuế khóa'],
  ['hệ thống thuế khóa', 'phép thuế khóa'],
  ['Hệ thống thuế quan', 'Phép thuế quan'],
  ['hệ thống thuế quan', 'phép thuế quan'],
  ['Hệ thống Thuế Máu', 'Lệ Thuế Máu'],
  ['Hệ thống tổng động viên', 'Lệ tổng động viên'],
  ['Hệ thống cống nạp', 'Lệ cống nạp'],
  ['Hệ thống Kurultai', 'Lệ Kurultai'],
  ['Hệ thống Millet', 'Chế độ Millet'],
  ['hệ thống Millet', 'chế độ Millet'],
  ['Hệ thống Timar', 'Chế độ Timar'],
  ['hệ thống Timar', 'chế độ Timar'],
  ['Hệ thống Folwark', 'Chế độ Folwark'],
  ['hệ thống Folwark', 'chế độ Folwark'],
  ['Hệ thống Végvár', 'Mạng lưới Végvár'],
  ['hệ thống Végvár', 'mạng lưới Végvár'],
  ['Hệ thống Voivode', 'Chế độ Voivode'],
  ['hệ thống Voivode', 'chế độ Voivode'],
  ['hệ thống Bailli', 'ngạch Bailli'],
  ['hệ thống Janissary', 'ngạch Janissary'],
  ['hệ thống Bergslagen', 'guồng Bergslagen'],
  ['Hệ thống Bán Giấy', 'Lề lối Bán Giấy'],
  ['Hệ thống phòng thủ', 'Mạng lưới phòng thủ'],
  ['hệ thống phòng thủ', 'mạng lưới phòng thủ'],
  ['Hệ thống phòng ngự', 'Lớp phòng ngự'],
  ['hệ thống phòng ngự', 'lớp phòng ngự'],
  ['hệ thống tường thành', 'vành tường thành'],
  ['Hệ thống tài chính', 'Guồng tài chính'],
  ['hệ thống tài chính', 'guồng tài chính'],
  ['Hệ thống kinh tế', 'Guồng kinh tế'],
  ['hệ thống kinh tế', 'guồng kinh tế'],
  ['Hệ thống sản xuất', 'Guồng sản xuất'],
  ['Hệ thống công nghiệp', 'Guồng lò rèn'],
  ['Hệ thống Quân sự', 'Bộ máy Quân sự'],
  ['hệ thống quân sự', 'bộ máy quân sự'],
  ['Hệ thống chính trị', 'Thể chế chính trị'],
  ['hệ thống chính trị', 'thể chế chính trị'],
  ['Hệ thống Nhà nước', 'Bộ máy Nhà nước'],
  ['Hệ thống Hành chính', 'Bộ máy Hành chính'],
  ['hệ thống hành chính', 'bộ máy hành chính'],
  ['Hệ thống ma pháp', 'Nền ma pháp'],
  ['hệ thống ma pháp', 'nền ma pháp'],
  ['hệ thống ma trận', 'mạng ma trận'],
  ['hệ thống hang động', 'mạng hang động'],
  ['hệ thống cống ngầm', 'mạng cống ngầm'],
  ['hệ thống núi non', 'dải núi non'],
  ['hệ thống ống kính', 'bộ ống kính'],
  ['hệ thống nông nô', 'chế độ nông nô'],
  ['hệ thống phong kiến', 'trật tự phong kiến'],
  ['hệ thống tín ngưỡng', 'nếp tín ngưỡng'],
  ['hệ thống xã hội', 'nếp xã hội'],
  ['hệ thống giao thương', 'mạng lưới giao thương'],
  ['hệ thống thương mại', 'mạng lưới thương mại'],
  ['hệ thống hóa tri thức', 'quy tri thức thành sách vở'],
  ['hệ thống hóa', 'quy thành phép tắc'],
  ['Hệ thống bòn rút', 'Guồng bòn rút'],
  ['Hệ thống này', 'Lề lối này'],
  ['hệ thống này', 'lề lối này'],
  ['Hệ thống', 'Chế độ'],
  ['hệ thống', 'lề lối'],
];

function suaTuVung(text) {
  let out = text;
  for (const [tu, thay] of TU_VUNG) out = out.split(tu).join(thay);
  return out;
}

// ---------------------------------------------------------------------------
// 2. TỪ KHÓA QUÁ RỘNG — mục 4.2 và lỗi số 1 của mục 15
// ---------------------------------------------------------------------------

/**
 * Bỏ ở MỌI entry.
 *
 * `matchMode: 'wholeWord'` cắt từ theo ranh giới chữ cái Unicode, nên "Pháp"
 * khớp cả trong "ma pháp" — một từ khóa như thế kéo entry Vương quốc Pháp vào
 * gần như mọi lượt chơi.
 */
const KHOA_CAM = new Set([
  'Pháp',
  'Con người',
  'loài người',
  'Tộc Người',
  'Tiên tộc',
  'lính đánh thuê',
  'Thương nhân',
  'Balkan',
  'nữ tu',
  'Tiên tri',
  'Ác ma',
  'thủ đô hoàng gia',
  'tỉnh Châu Âu',
  'tàn tích chiến tranh',
  'quý tộc phong kiến',
  'Hình phạt tôn giáo',
  'Lệnh cấm',
  'Nghệ thuật và Ma pháp',
  'Mật thám',
  'Đầu sỏ chính trị',
  'chế độ nông nô',
  'Cống nạp',
]);

/** Bỏ ở đúng một entry, vì entry KHÁC mới là chủ của từ khóa đó. */
const KHOA_CAM_THEO_ENTRY = {
  14: ['Transylvania', 'Wallachia'],
  88: ['Alps'],
  20: ['Giáo hội Công giáo'],
  98: ['Papal States', 'Quốc gia Giáo hoàng', 'Thành Rome', 'Vatican'],
  150: ['Mã Nhân', 'Mục Nhân', 'Miêu Nhân', 'Quạ Nhân', 'Thử Nhân', 'Lang Nhân', 'Hùng Nhân'],
  195: ['Thẩm vấn viên', 'Tòa án Dị giáo'],
  246: ['Vatican'],
  80: ['Köln', 'Nhà thờ chính tòa Cologne'],
};

// ---------------------------------------------------------------------------
// 3. ID — quy ước mục 2
// ---------------------------------------------------------------------------

/** Địa danh: id trùng luôn với node trong `data/regions.json`. */
const ID_DIA_DANH = {
  3: 'prov_alps', 4: 'hold_frankfurt', 5: 'prov_mainz', 6: 'prov_bayern',
  7: 'hold_strasbourg', 8: 'hold_nuremberg', 9: 'hold_augsburg', 10: 'hold_aachen',
  11: 'prov_hessen', 12: 'prov_thanh-bang-ngam-lun', 13: 'realm_france',
  14: 'prov_carpathian', 15: 'prov_steppe-pontic', 16: 'hold_chinon',
  17: 'hold_mont-saint-michel', 18: 'hold_carcassonne', 19: 'hold_constantinople',
  20: 'realm_papal', 21: 'realm_florence', 22: 'prov_normandy', 23: 'hold_bursa',
  24: 'hold_edirne', 25: 'prov_morea', 26: 'hold_sarai', 27: 'hold_caffa',
  28: 'hold_kazan-kremlin', 29: 'hold_astrakhan', 30: 'realm_muscovy',
  31: 'realm_novgorod', 32: 'realm_ryazan', 33: 'realm_tver', 34: 'hold_ghenh-dnieper',
  35: 'realm_pskov', 36: 'realm_poland', 37: 'realm_lithuania', 38: 'prov_pomerania',
  39: 'prov_mazovia', 40: 'realm_denmark', 41: 'hold_gotland', 42: 'realm_venice',
  43: 'realm_wallachia', 44: 'realm_portugal', 45: 'realm_granada', 46: 'realm_england',
  47: 'realm_scotland', 48: 'realm_ferrara', 49: 'realm_siena', 50: 'realm_mantua',
  51: 'realm_urbino', 52: 'realm_lucca', 53: 'realm_genoa', 54: 'realm_naples',
  55: 'realm_savoy', 56: 'realm_aragon', 57: 'realm_castile', 58: 'prov_bohemia',
  59: 'hold_vienna', 60: 'prov_trier', 61: 'prov_brandenburg', 62: 'hold_regensburg',
  63: 'hold_lubeck', 64: 'prov_baden', 65: 'prov_brittany', 66: 'prov_aquitaine',
  67: 'prov_rumelia', 68: 'realm_sweden', 69: 'prov_transylvania', 70: 'prov_rung-den',
  71: 'prov_palatinate', 72: 'prov_luu-vuc-rhine', 73: 'hold_cologne', 74: 'hold_hamburg',
  75: 'realm_milan', 76: 'prov_anjou', 77: 'prov_anatolia', 78: 'realm_norway',
  79: 'realm_hungary', 80: 'prov_cologne', 81: 'prov_saxony', 82: 'prov_bo-bien-baltic',
  83: 'prov_wurttemberg', 84: 'realm_burgundy', 85: 'prov_bourbon', 86: 'hold_gallipoli',
  87: 'realm_albania', 88: 'realm_swiss', 89: 'prov_ao', 90: 'prov_orleans',
  91: 'hold_varna', 92: 'prov_low-countries', 93: 'prov_avignon',
};

/** Thế lực và tổ chức. `nation_*` cho thế lực có chủ quyền, `org_*` cho phần còn lại. */
const ID_THE_LUC = {
  94: 'nation_ottoman', 95: 'org_janissary', 96: 'org_phao-binh-ottoman',
  97: 'nation_hre', 98: 'org_giao-hoi-cong-giao', 99: 'org_lien-minh-hanse',
  100: 'org_dong-tu-teuton', 101: 'org_long-cuu-vang', 102: 'org_decapole',
  103: 'org_palaiologos', 104: 'org_quan-thuong-truc-phap', 105: 'org_hoi-nghi-dang-cap-phap',
  106: 'org_hau-cung-ottoman', 107: 'org_chinh-thong-giao', 108: 'nation_crimea',
  109: 'nation_kazan', 110: 'org_thi-toc-mansur', 111: 'org_hoi-dong-boyar',
  112: 'nation_livonia', 113: 'org_sejm', 114: 'nation_kalmar', 115: 'org_stratioti',
  116: 'org_giao-trieu-la-ma', 117: 'org_toa-an-di-giao', 118: 'org_lien-minh-swabia',
  119: 'org_can-ve-varangian', 120: 'org_dai-hoi-de-quoc', 121: 'nation_nogai',
  122: 'org_thi-toc-shirin', 123: 'nation_kipchak', 124: 'nation_oirat', 125: 'nation_dai-truong',
};

/** Chủng tộc: id chính tắc của `data/races.json`, để Phần 6 tra ngược được. */
const ID_CHUNG_TOC = {
  126: 'race_lam-tien', 127: 'race_ban-nhan', 128: 'race_kobold', 129: 'race_cao-tien',
  130: 'race_am-tien', 131: 'race_ban-tien', 132: 'race_lun-nui', 133: 'race_lun-vuc-sau',
  134: 'race_gnome', 135: 'race_lang-nhan', 136: 'race_hung-nhan', 137: 'race_mieu-nhan',
  138: 'race_qua-nhan', 139: 'race_thu-nhan', 140: 'race_ma-nhan', 141: 'race_nguu-nhan',
  142: 'race_orc', 143: 'race_ogre', 144: 'race_ban-khong-lo', 145: 'race_troll-da',
  146: 'race_long-due', 147: 'race_ma-due', 148: 'race_thien-due', 149: 'race_thach-due',
  150: 'race_nhom-nguoi-thu', 151: 'race_hai-toc', 152: 'race_phong-tien',
  153: 'race_bang-toc', 154: 'race_moc-toc', 155: 'race_tro-tan', 156: 'race_nhan-loai',
};

const KHONG_DAU = {
  à: 'a', á: 'a', ạ: 'a', ả: 'a', ã: 'a', â: 'a', ầ: 'a', ấ: 'a', ậ: 'a', ẩ: 'a', ẫ: 'a',
  ă: 'a', ằ: 'a', ắ: 'a', ặ: 'a', ẳ: 'a', ẵ: 'a', è: 'e', é: 'e', ẹ: 'e', ẻ: 'e', ẽ: 'e',
  ê: 'e', ề: 'e', ế: 'e', ệ: 'e', ể: 'e', ễ: 'e', ì: 'i', í: 'i', ị: 'i', ỉ: 'i', ĩ: 'i',
  ò: 'o', ó: 'o', ọ: 'o', ỏ: 'o', õ: 'o', ô: 'o', ồ: 'o', ố: 'o', ộ: 'o', ổ: 'o', ỗ: 'o',
  ơ: 'o', ờ: 'o', ớ: 'o', ợ: 'o', ở: 'o', ỡ: 'o', ù: 'u', ú: 'u', ụ: 'u', ủ: 'u', ũ: 'u',
  ư: 'u', ừ: 'u', ứ: 'u', ự: 'u', ử: 'u', ữ: 'u', ỳ: 'y', ý: 'y', ỵ: 'y', ỷ: 'y', ỹ: 'y',
  đ: 'd',
  // Tên riêng châu Âu: NFD không tách được những chữ này, mà bỏ qua chúng thì
  // "Radziwiłł" ra `radziwi` — một id cụt mà không ai đoán được là của ai.
  ł: 'l', ø: 'o', å: 'a', æ: 'ae', œ: 'oe', ß: 'ss', ð: 'd', þ: 'th',
};

function slug(text) {
  const thuong = text.toLowerCase();
  let ra = '';
  for (const ch of thuong) ra += KHONG_DAU[ch] ?? ch;
  return ra
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// 4. SUMMARY — mục 7, "việc đáng làm nhất"
// ---------------------------------------------------------------------------

const TRAN_SUMMARY = 620;

function lay(text, mau) {
  const m = mau.exec(text);
  return m === null ? '' : m[1].trim();
}

function cat(text, tran = TRAN_SUMMARY) {
  if (text.length <= tran) return text;
  const cut = text.slice(0, tran);
  const cham = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return (cham > tran * 0.5 ? cut.slice(0, cham + 1) : cut).trim();
}

/** Câu đầu của đoạn văn xuôi đầu tiên — đường lui khi entry không theo khuôn. */
function doanDau(noiDung) {
  for (const dong of noiDung.split('\n')) {
    const d = dong.trim();
    if (d === '' || d.startsWith('#') || d.startsWith('-') || d.endsWith(':')) continue;
    return d;
  }
  return '';
}

/** Nối câu mà không dính hai câu vào nhau vì bản gốc quên dấu chấm. */
function cham(text) {
  const t = text.trim();
  return t === '' || /[.!?…]$/.test(t) ? t : `${t}.`;
}

function taoSummary(noiDung, ten, loai) {
  if (loai === 'person') {
    const than = lay(noiDung, /^\s*Thân phận:\s*(.+)$/m);
    const dinhVi = lay(noiDung, /^\s*Định vị:\s*(.+)$/m);
    const duc = lay(noiDung, /^\s*Dục vọng bề mặt:\s*(.+)$/m);
    const hieu = lay(noiDung, /——(.+?)——/);
    const phan = [`${ten} — ${cham(than || doanDau(noiDung))}`];
    if (hieu !== '') phan.push(`Người ta gọi ả là ${hieu}.`);
    if (duc !== '') phan.push(`Muốn: ${cham(duc)}`);
    if (dinhVi !== '') phan.push(`Với {{user}}: ${cham(dinhVi)}`);
    return cat(phan.join(' '));
  }

  const dinh = lay(noiDung, /^-\s*Định nghĩa:\s*(.+)$/m);
  const trang = lay(noiDung, /^-\s*Trạng thái\/Cấp độ:\s*(.+)$/m);
  const goc = cham(dinh !== '' ? dinh : doanDau(noiDung));
  const day = trang === '' ? `${ten}: ${goc}` : `${ten}: ${goc} ${cham(trang)}`;
  return cat(day);
}

// ---------------------------------------------------------------------------
// 5. XẺ BA TẦNG TRI THỨC — mục 8
// ---------------------------------------------------------------------------

/**
 * Bệnh của SillyTavern: hồ sơ nhân vật chèn vào là AI biết hết, nên NPC nói ra
 * nỗi sợ sâu kín của mình ở lượt gặp đầu tiên. Cách chữa của mục 8 là chia ba
 * mức, và cả 73 hồ sơ đều theo đúng một khuôn nên chia được bằng máy, không mất
 * một chữ nào:
 *
 *   public  hồ sơ, ngoại hình, bối cảnh, quan hệ, bảng màu, "Chế độ áo giáp",
 *           "Dục vọng bề mặt", "Giới hạn đạo đức", lưu ý cho AI, hình tượng
 *   gated   "Chế độ buông lỏng", "Chế độ vết nứt", "Bức tranh trộn màu"
 *           — mặt riêng, chỉ hiện khi người chơi đã thân cận
 *   secret  "Sự thiếu hụt sâu thẳm", "Nỗi sợ hãi cốt lõi", "Cơ chế phòng ngự",
 *           "Mâu thuẫn cốt lõi" — không bao giờ vào prompt chính
 *
 * HAI CHỖ CỐ Ý GIỮ Ở PUBLIC, đừng tưởng sót:
 * - "Dục vọng bề mặt" theo đúng tên của nó là thứ ai nhìn cũng thấy.
 * - "Giới hạn đạo đức" là rào chắn hành vi — nó nói nhân vật KHÔNG BAO GIỜ làm
 *   gì. Giấu nó đi thì AI kể chuyện sẽ cho nhân vật làm đúng cái họ không làm,
 *   mà đó là hỏng nặng hơn nhiều so với việc lộ một bí mật.
 */
const XE_GATED_SUB = new Set(['Chế độ buông lỏng', 'Chế độ vết nứt']);
const XE_SECRET_SUB = new Set([
  'Sự thiếu hụt sâu thẳm',
  'Nỗi sợ hãi cốt lõi',
  'Cơ chế phòng ngự',
  'Mâu thuẫn cốt lõi',
]);
const XE_GATED_BLOCK = new Set(['Bức tranh trộn màu']);

function xeNhanVat(noiDung) {
  const gio = { public: [], gated: [], secret: [] };
  let khoi = '';
  let tang = 'public';

  for (const dong of noiDung.split('\n')) {
    const chu = dong.trim();
    if (chu === '') {
      gio[tang].push(dong);
      continue;
    }
    const thut = dong.length - dong.trimStart().length;

    if (thut === 0) {
      // Bỏ phần trong ngoặc: "Giải thích lần hai (Lưu ý…)" và "Bảng màu (Tính cách)".
      khoi = chu.replace(/:$/, '').replace(/\s*\(.*\)\s*$/, '');
      tang = XE_GATED_BLOCK.has(khoi) ? 'gated' : 'public';
      gio[tang].push(dong);
      continue;
    }

    if (thut === 2) {
      const ten = (/^([^:]+):/.exec(chu)?.[1] ?? '').trim();
      tang = XE_SECRET_SUB.has(ten)
        ? 'secret'
        : XE_GATED_SUB.has(ten)
          ? 'gated'
          : XE_GATED_BLOCK.has(khoi)
            ? 'gated'
            : 'public';
      gio[tang].push(dong);
      continue;
    }

    // Thụt sâu hơn thì đi theo cha — không tự quyết tầng.
    gio[tang].push(dong);
  }

  /**
   * Dọn lại phần đã xẻ.
   *
   * KHÔNG dùng `trim()`: nó ăn luôn hai khoảng trắng thụt đầu dòng đầu tiên, và
   * kết quả là mục đầu của mỗi khối thò ra so với các mục dưới nó. Chỉ cắt
   * xuống dòng thừa ở hai đầu, rồi trả lại một dòng trống trước mỗi tiêu đề cấp
   * 0 — dòng trống ấy đã bị xẻ sang tầng khác.
   */
  const gom = (list) =>
    list
      .join('\n')
      .replace(/^[\r\n]+/, '')
      .replace(/\s+$/, '')
      .replace(/([^\n])\n(?=\S[^\n]*:[ \t]*$)/gm, '$1\n\n')
      .replace(/\n{3,}/g, '\n\n');

  return { public: gom(gio.public), gated: gom(gio.gated), secret: gom(gio.secret) };
}

// ---------------------------------------------------------------------------
// 6. QUAN HỆ GIỮA ENTRY — mục 7
// ---------------------------------------------------------------------------

/**
 * `related` kéo entry vào KHÔNG CẦN khớp từ khóa, nên nó là con dao hai lưỡi:
 * nối rộng tay là mỗi lượt kéo vào ba chục entry.
 *
 * Ba luật giữ nó hẹp:
 * - chỉ quét MỘT VÀI DÒNG có sức nặng (thân phận, gia cảnh, định nghĩa), không
 *   quét cả entry — nhắc tên trong một câu tả cảnh không phải là quan hệ
 * - tên phải đủ dài và không được mơ hồ (một tên trỏ hai entry thì bỏ)
 * - tối đa bốn mối cho mỗi entry, tên dài đứng trước vì nó cụ thể hơn
 */
const QUAN_HE_TOI_DA = 4;
const TEN_TOI_THIEU = 5;

/** Dòng đáng tin cho từng loại — nơi quan hệ THẬT được khai. */
const DONG_QUAN_HE = {
  person: [
    /^\s*Thân phận:\s*(.+)$/gm,
    /^\s*Gia cảnh:\s*(.+)$/gm,
    /^\s*Tình trạng kinh tế:\s*(.+)$/gm,
    /^\s*Học nghiệp \/ Sự nghiệp:\s*(.+)$/gm,
    /^\s*Hoàn cảnh hiện tại:\s*(.+)$/gm,
    /^\s*Cách thức quen biết:\s*(.+)$/gm,
  ],
  place: [/^-\s*Định nghĩa:\s*(.+)$/gm, /^-\s*Phân loại:\s*(.+)$/gm, /^-\s*Trạng thái\/Cấp độ:\s*(.+)$/gm],
  faction: [/^-\s*Định nghĩa:\s*(.+)$/gm, /^-\s*Phân loại:\s*(.+)$/gm, /^-\s*Trạng thái\/Cấp độ:\s*(.+)$/gm],
  concept: [/^-\s*Định nghĩa:\s*(.+)$/gm, /^-\s*Trạng thái\/Cấp độ:\s*(.+)$/gm],
};

function chuoiQuanHe(noiDung, loai) {
  const mau = DONG_QUAN_HE[loai];
  if (mau === undefined) return '';
  const phan = [];
  for (const re of mau) for (const m of noiDung.matchAll(re)) phan.push(m[1]);
  return phan.join('\n');
}

/** Cha trong cây vùng, nếu cha đó cũng là một entry. */
const CHA_VUNG = new Map(VUNG.map((node) => [node.id, node.parentId]));

// ---------------------------------------------------------------------------
// 7. Chạy
// ---------------------------------------------------------------------------

const LOAI = {
  '[Địa danh]': 'place',
  '[Tổ chức]': 'faction',
  '[Thế lực]': 'faction',
  '[Chủng tộc]': 'custom',
  '[Nhân vật]': 'person',
  '[Khái niệm]': 'concept',
};

const TRONG_SO = { place: 10, faction: 10, custom: 10, person: 14, concept: 12, event: 12 };
const UU_TIEN = { place: 7, faction: 7, custom: 7, person: 8, concept: 7, event: 8 };

const goc = JSON.parse(readFileSync(NGUON, 'utf8'));
const dsGoc = Object.values(goc.entries);

const canhBao = [];
const sach = {
  'book-dia-danh': { ten: 'Europa 1444 · Địa danh', tep: '10-dia-danh.json', entries: [] },
  'book-the-luc': { ten: 'Europa 1444 · Thế lực và tổ chức', tep: '20-the-luc.json', entries: [] },
  'book-chung-toc': { ten: 'Europa 1444 · Chủng tộc', tep: '30-chung-toc.json', entries: [] },
  'book-nhan-vat': { ten: 'Europa 1444 · Nhân vật', tep: '40-nhan-vat.json', entries: [] },
  'book-nhan-vat-be-trong': {
    ten: 'Europa 1444 · Mặt riêng và động cơ thật',
    tep: '45-nhan-vat-be-trong.json',
    entries: [],
  },
  'book-khai-niem': { ten: 'Europa 1444 · Khái niệm và thể chế', tep: '50-khai-niem.json', entries: [] },
  'book-lich-su': { ten: 'Europa 1444 · Thế giới và lịch sử', tep: '05-the-gioi-lich-su.json', entries: [] },
};

function themEntry(bookId, entry) {
  sach[bookId].entries.push(entry);
}

function dungEntry(raw, { id, loai, ten, keys, bookId, them = {} }) {
  const noiDung = suaTuVung(raw.content).trim();
  const entry = {
    id,
    title: ten,
    type: loai,
    content: noiDung,
    summary: taoSummary(noiDung, ten, loai),
    keys,
    matchMode: 'wholeWord',
    caseSensitive: false,
    constant: false,
    knowledge: 'public',
    placement: 'block',
    weight: TRONG_SO[loai] ?? 10,
    budgetPriority: UU_TIEN[loai] ?? 7,
    recurse: false,
    preventRecursion: false,
    triggerOnce: false,
    ...them,
  };
  themEntry(bookId, entry);
  return entry;
}

for (const raw of dsGoc) {
  const comment = String(raw.comment ?? '');
  const nhan = comment.slice(0, comment.indexOf(']') + 1);
  const tenGoc = comment.slice(nhan.length).trim();

  // --- hai entry constant khổng lồ: xử lý riêng ở cuối file ---
  if (raw.id === 1 || raw.id === 2) continue;

  const loai = LOAI[nhan];
  if (loai === undefined) {
    canhBao.push(`Không nhận ra nhãn "${nhan}" của entry ${raw.id} (${tenGoc})`);
    continue;
  }

  // Từ khóa: sửa từ vựng, bỏ khóa quá rộng, khử trùng lặp.
  const camRieng = new Set(KHOA_CAM_THEO_ENTRY[raw.id] ?? []);
  const keys = [];
  for (const k of raw.keys ?? []) {
    const key = suaTuVung(String(k).trim());
    if (key === '' || KHOA_CAM.has(key) || camRieng.has(key)) continue;
    if (!keys.includes(key)) keys.push(key);
  }
  if (keys.length === 0) canhBao.push(`Entry ${raw.id} (${tenGoc}) không còn từ khóa nào.`);

  // Tên hiển thị: từ khóa đầu tiên là tên tiếng Việt của thứ đó.
  const ten = keys[0] ?? tenGoc;

  let id;
  let bookId;
  if (loai === 'place') {
    id = ID_DIA_DANH[raw.id];
    bookId = 'book-dia-danh';
  } else if (loai === 'faction') {
    id = ID_THE_LUC[raw.id];
    bookId = 'book-the-luc';
  } else if (loai === 'custom') {
    id = ID_CHUNG_TOC[raw.id];
    bookId = 'book-chung-toc';
  } else if (loai === 'person') {
    id = `npc_${slug(keys[0] ?? tenGoc)}`;
    bookId = 'book-nhan-vat';
  } else {
    id = `concept_${slug(keys[0] ?? tenGoc)}`;
    bookId = 'book-khai-niem';
  }

  if (id === undefined) {
    canhBao.push(`Entry ${raw.id} (${tenGoc}) chưa có id trong bảng ánh xạ.`);
    continue;
  }

  if (loai !== 'person') {
    dungEntry(raw, { id, loai, ten, keys, bookId });
    continue;
  }

  // --- nhân vật: một hồ sơ ra ba entry, ba mức tri thức (mục 8) -------------
  const xe = xeNhanVat(suaTuVung(raw.content).trim());
  const than = slug(keys[0] ?? tenGoc);

  dungEntry({ ...raw, content: xe.public }, { id, loai, ten, keys, bookId });

  if (xe.gated !== '') {
    dungEntry(
      { ...raw, content: `Mặt riêng của ${ten} — chỉ ai đã thân cận mới thấy:\n\n${xe.gated}` },
      {
        id: `${id}-rieng-tu`,
        loai,
        ten: `${ten} — mặt riêng`,
        keys,
        bookId: 'book-nhan-vat-be-trong',
        them: {
          knowledge: 'gated',
          requiresKnowledge: [`fact_than-can-${than}`],
          budgetPriority: 6,
          summary: `${ten} lúc không phải diễn: dáng vẻ khi buông lỏng, và chỗ nứt khi kế hoạch đổ vỡ.`,
        },
      },
    );
  }

  if (xe.secret !== '') {
    dungEntry(
      {
        ...raw,
        content:
          `Động cơ thật của ${ten}. Mô phỏng ngầm dùng cái này để ả hành động ` +
          `đúng lý do thật; AI kể chuyện KHÔNG được thấy.\n\nTầng nhân cách cốt lõi:\n${xe.secret}`,
      },
      {
        id: `${id}-be-trong`,
        loai,
        ten: `${ten} — động cơ thật`,
        keys,
        bookId: 'book-nhan-vat-be-trong',
        them: {
          knowledge: 'secret',
          budgetPriority: 5,
          summary: `Động cơ thật của ${ten}: sự thiếu hụt, nỗi sợ cốt lõi, cơ chế phòng ngự và mâu thuẫn bên trong.`,
        },
      },
    );
  }
}

// ---------------------------------------------------------------------------
// 6. Hai entry nền: bối cảnh và dòng thời gian
// ---------------------------------------------------------------------------

const boiCanh = dsGoc.find((e) => e.id === 1);
const lichSu = dsGoc.find((e) => e.id === 2);

dungEntry(boiCanh, {
  id: 'concept_the-gioi-europa',
  loai: 'concept',
  ten: 'Cấu trúc thực tại của Lục địa Europa',
  keys: [
    'Lục địa Europa', 'Europa', 'dòng chảy ma lực', 'từ trường ma thuật',
    'Ma pháp Thần thánh', 'Ma pháp Bí thuật', 'chủng tộc á nhân', 'á nhân',
  ],
  bookId: 'book-lich-su',
  them: { budgetPriority: 9, weight: 14 },
});

/**
 * Dòng thời gian bị CẮT LÀM ĐÔI ở mốc 1444.
 *
 * Bản gốc là một entry constant chứa cả năm 1453, 1477 và 1492 — tức là tương
 * lai so với lúc chơi. Để nguyên thì AI biết trước Constantinople sẽ thất thủ
 * và Granada sẽ sụp, đúng cái mà chính các entry nhân vật cấm ("Cấm tạo các sự
 * kiện tương lai"). Nửa sau chuyển sang `knowledge: 'secret'` — mục 8: không
 * bao giờ vào prompt chính, chỉ vào mô phỏng ngầm của Phần 15, để thế giới vẫn
 * chạy đúng sau lưng người chơi.
 */
const MOC_CAT = '## Giai đoạn: Hậu Varna';
const viTri = lichSu.content.indexOf(MOC_CAT);
if (viTri < 0) throw new Error('Không tìm thấy mốc cắt dòng thời gian.');

dungEntry(
  { ...lichSu, content: lichSu.content.slice(0, viTri) },
  {
    id: 'event_lich-su-den-1444',
    loai: 'event',
    ten: 'Dòng thời gian Europa, từ Kỷ nguyên Thần Thoại đến Varna 1444',
    keys: [
      'Kỷ nguyên Thần Thoại', 'Thời kỳ Tăm Tối', 'Thập Tự Chinh', 'Đại Không Vương',
      'Interregnum', 'Chiến tranh Trăm Năm', 'Đạo luật Vàng', 'Golden Bull',
      'Chiến tranh Hussite', 'Chiến tranh Zürich Cũ', 'Trận Varna', 'lịch sử Europa',
    ],
    bookId: 'book-lich-su',
    them: { budgetPriority: 8, weight: 12, validUntil: { year: 1500, month: 12, day: 31, hour: 23 } },
  },
);

dungEntry(
  { ...lichSu, content: lichSu.content.slice(viTri) },
  {
    id: 'event_lich-su-sau-1444',
    loai: 'event',
    ten: 'Những gì SẼ xảy ra sau 1444 — chỉ mô phỏng ngầm được biết',
    // Không để `constant`: entry constant bị cổng gác đòi dưới 600 ký tự, mà
    // đây là một đoạn dài. Từ khóa đủ rộng để mô phỏng ngầm kéo nó vào đúng lúc.
    keys: [
      'Constantinople', 'Granada', 'Burgundy', 'Chiến tranh Hoa Hồng', 'Wars of the Roses',
      'Charles the Bold', 'Mehmed II', 'Tân Thế Giới', 'Kỷ nguyên Đại Hàng Hải',
      'Reconquista', 'tương lai', 'số phận',
    ],
    bookId: 'book-lich-su',
    them: {
      knowledge: 'secret',
      budgetPriority: 5,
      weight: 8,
      summary:
        'Đường đi của lịch sử sau tháng 11 năm 1444, theo bản ghi của mô phỏng ngầm: ' +
        'Constantinople thất thủ, Chiến tranh Trăm Năm khép lại, Anh quốc nội chiến, ' +
        'Burgundy tan, Granada sụp. Không nhân vật nào trong thế giới biết những điều này.',
    },
  },
);

// ---------------------------------------------------------------------------
// 8. Nối quan hệ và gắn biến thể — chạy SAU khi đã có đủ entry
// ---------------------------------------------------------------------------

const tatCa = Object.values(sach).flatMap((s) => s.entries);
const coId = new Set(tatCa.map((e) => e.id));

/** tên riêng → id entry. Tên trỏ hai chỗ thì bỏ, vì đoán sai còn tệ hơn không nối. */
const TEN_TOI_ID = new Map();
const tenMoHo = new Set();
for (const e of tatCa) {
  if (!['place', 'faction'].includes(e.type)) continue;
  for (const key of e.keys) {
    if (key.length < TEN_TOI_THIEU) continue;
    if (TEN_TOI_ID.has(key) && TEN_TOI_ID.get(key) !== e.id) tenMoHo.add(key);
    else TEN_TOI_ID.set(key, e.id);
  }
}
for (const key of tenMoHo) TEN_TOI_ID.delete(key);

const TEN_SAP_XEP = [...TEN_TOI_ID.keys()].sort((a, b) => b.length - a.length);

function khopTen(text, ten) {
  const re = new RegExp(`(?<!\\p{L})${ten.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\p{L})`, 'iu');
  return re.test(text);
}

let soQuanHe = 0;
for (const e of tatCa) {
  const noi = [];

  // (a) quan hệ theo cây vùng: một thành trì thuộc về tỉnh của nó.
  const cha = CHA_VUNG.get(e.id);
  if (cha !== undefined && cha !== null && coId.has(cha)) noi.push({ id: cha, pullWeight: 0.5 });

  // (b) quan hệ theo tên riêng nhắc trong những dòng có sức nặng.
  const chuoi = chuoiQuanHe(e.content, e.type);
  if (chuoi !== '') {
    for (const ten of TEN_SAP_XEP) {
      if (noi.length >= QUAN_HE_TOI_DA) break;
      const dich = TEN_TOI_ID.get(ten);
      if (dich === e.id || noi.some((r) => r.id === dich)) continue;
      if (khopTen(chuoi, ten)) noi.push({ id: dich, pullWeight: noi.length < 2 ? 0.7 : 0.5 });
    }
  }

  // (c) ba entry của cùng một nhân vật kéo lẫn nhau — cổng L5 vẫn chặn đúng chỗ.
  if (e.type === 'person' && !e.id.endsWith('-rieng-tu') && !e.id.endsWith('-be-trong')) {
    for (const hau of ['-rieng-tu', '-be-trong']) {
      if (coId.has(`${e.id}${hau}`)) noi.push({ id: `${e.id}${hau}`, pullWeight: 0.9 });
    }
  }

  if (noi.length > 0) {
    e.related = noi;
    soQuanHe += noi.length;
  }
}

// --- biến thể theo góc nhìn, viết tay trong tools/bien-the.json (mục 6) -----
const chiMuc = new Map(tatCa.map((e) => [e.id, e]));
let soBienThe = 0;
for (const [entryId, variants] of Object.entries(BIEN_THE.variants)) {
  const dich = chiMuc.get(entryId);
  if (dich === undefined) {
    canhBao.push(`bien-the.json trỏ tới entry "${entryId}" không tồn tại.`);
    continue;
  }
  dich.variants = variants;
  soBienThe += variants.length;
}

// ---------------------------------------------------------------------------
// 9. Ghi ra và báo cáo
// ---------------------------------------------------------------------------

mkdirSync(DICH, { recursive: true });

const tatCaId = new Map();
let tong = 0;

for (const [bookId, s] of Object.entries(sach)) {
  for (const e of s.entries) {
    if (tatCaId.has(e.id)) canhBao.push(`Trùng id "${e.id}" giữa hai entry.`);
    tatCaId.set(e.id, bookId);
  }
  tong += s.entries.length;

  const bundle = {
    kind: 'eu1444-lorebook',
    schemaVersion: 1,
    exportedAt: 0,
    books: [
      {
        id: bookId,
        name: s.ten,
        version: 1,
        scope: { kind: 'global' },
        enabled: true,
        autoScope: false,
        priority: 0,
        entries: s.entries,
      },
    ],
  };
  writeFileSync(join(DICH, s.tep), `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
  console.log(`${s.tep.padEnd(28)} ${String(s.entries.length).padStart(3)} entry`);
}

// --- cổng gác: từ cấm và từ hiện đại còn sót ---
const CAN_QUET = ['lãnh địa', 'hệ thống', 'năng lượng', 'hiệu suất', 'tối ưu', 'phần trăm', 'dữ liệu', 'công nghệ'];
const sot = new Map();
for (const [, s] of Object.entries(sach)) {
  for (const e of s.entries) {
    const text = `${e.title}\n${e.content}\n${e.summary}\n${e.keys.join('\n')}`;
    for (const tu of CAN_QUET) {
      const n = text.toLowerCase().split(tu).length - 1;
      if (n > 0) sot.set(tu, (sot.get(tu) ?? 0) + n);
    }
  }
}

const theoTang = { public: 0, gated: 0, secret: 0 };
for (const e of tatCa) theoTang[e.knowledge] += 1;

console.log(`\nTổng: ${tong} entry, ${tatCaId.size} id duy nhất.`);
console.log(`Cổng tri thức: public ${theoTang.public} · gated ${theoTang.gated} · secret ${theoTang.secret}`);
console.log(`Quan hệ: ${soQuanHe} mối · Biến thể: ${soBienThe} bản trên ${Object.keys(BIEN_THE.variants).length} entry`);
console.log('Từ cần dọn còn sót:', sot.size === 0 ? 'không còn' : [...sot].map(([k, v]) => `${k}=${v}`).join(', '));
if (canhBao.length > 0) console.log(`\nCẢNH BÁO:\n${canhBao.map((c) => `  ! ${c}`).join('\n')}`);
