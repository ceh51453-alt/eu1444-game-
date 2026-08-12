/**
 * SINH `data/world-map.json` TỪ `data/regions.json`.
 *
 *   node tools/tao-ban-do.mjs
 *
 * Vì sao là script chứ không sửa tay: 122 vùng, và `regions.json` còn được sửa
 * tiếp. Toạ độ phải suy ra từ một bảng vĩ độ/kinh độ ĐỌC ĐƯỢC chứ không phải từ
 * 122 cặp số ai đó gõ tay — gõ tay thì không ai kiểm lại được, và một con số sai
 * chỉ lộ ra ba tháng sau khi một tin đồn từ Lisboa tới Moskva trong bốn ngày.
 *
 * Phép chiếu là phẳng có chủ ý. Đây là bản đồ để ĐO ĐƯỜNG ĐI, không phải bản đồ
 * để in ra treo tường: mọi thứ đọc nó (`src/sim/map.ts`) chỉ hỏi "từ đây tới đó
 * bao nhiêu cây số theo tuyến nào", và ở phạm vi châu Âu thì sai số của phép
 * chiếu phẳng nhỏ hơn nhiều so với sai số của chính con đường thế kỷ 14.
 *
 * Script này KHÔNG sinh cạnh: cạnh suy ra lúc chạy từ `adjacent` và `parentId`
 * của `regions.json`, cộng với `lanes` khai tay ở cuối file này. Sinh sẵn cạnh
 * là chép lại một thứ đã có, và hai bản chép sẽ lệch nhau ở lần sửa thứ nhất.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Vĩ độ, kinh độ, địa hình, chất lượng đường (0–3).
 *
 * Nơi có thật thì lấy toạ độ thật. Nơi hư cấu (Ehrenfeld, Brogg, các thành bang
 * ngầm tộc Lùn) đặt vào đúng vùng mà lorebook mô tả.
 */
const BANG = {
  // --- Vùng tự nhiên xuyên quốc gia ---
  'prov_alps': [46.5, 10.5, 'nui', 0],
  'prov_carpathian': [47.5, 24.5, 'nui', 0],
  'prov_steppe-pontic': [47.0, 37.0, 'thao-nguyen', 0],

  // --- Thế lực và vương quốc ---
  'realm_hre': [50.0, 10.0, 'dong-bang', 2],
  'realm_france': [47.5, 2.5, 'dong-bang', 2],
  'realm_burgundy': [47.3, 4.8, 'doi', 2],
  'realm_swiss': [46.8, 8.2, 'nui', 1],
  'realm_england': [52.5, -1.5, 'dong-bang', 2],
  'realm_scotland': [56.8, -4.2, 'nui', 1],
  'realm_portugal': [39.5, -8.2, 'doi', 1],
  'realm_castile': [40.5, -4.0, 'doi', 1],
  'realm_aragon': [41.6, 0.6, 'doi', 1],
  'realm_granada': [37.2, -3.6, 'nui', 1],
  'realm_savoy': [45.5, 6.5, 'nui', 1],
  'realm_milan': [45.5, 9.2, 'dong-bang', 2],
  'realm_venice': [45.4, 12.3, 'dam-lay', 2],
  'realm_genoa': [44.4, 8.9, 'doi', 2],
  'realm_florence': [43.8, 11.25, 'doi', 2],
  'realm_siena': [43.3, 11.3, 'doi', 1],
  'realm_lucca': [43.85, 10.5, 'doi', 1],
  'realm_ferrara': [44.84, 11.6, 'dong-bang', 2],
  'realm_mantua': [45.16, 10.79, 'dong-bang', 2],
  'realm_urbino': [43.7, 12.6, 'nui', 1],
  'realm_papal': [41.9, 12.5, 'doi', 2],
  'realm_naples': [40.85, 14.3, 'doi', 1],
  'realm_denmark': [55.7, 9.5, 'dong-bang', 2],
  'realm_sweden': [59.3, 15.5, 'rung', 1],
  'realm_norway': [60.5, 8.5, 'nui', 0],
  'realm_poland': [52.2, 19.5, 'dong-bang', 1],
  'realm_lithuania': [54.7, 25.3, 'rung', 1],
  'realm_teutonic': [54.0, 19.5, 'dong-bang', 2],
  'realm_livonia': [56.9, 24.1, 'rung', 1],
  'realm_hungary': [47.5, 19.0, 'dong-bang', 1],
  'realm_wallachia': [44.4, 25.0, 'dong-bang', 1],
  'realm_albania': [41.3, 19.8, 'nui', 0],
  'realm_muscovy': [55.75, 37.6, 'rung', 1],
  'realm_novgorod': [58.5, 31.3, 'rung', 1],
  'realm_pskov': [57.8, 28.3, 'rung', 1],
  'realm_tver': [56.86, 35.9, 'rung', 1],
  'realm_ryazan': [54.6, 39.7, 'rung', 1],
  'realm_ottoman': [41.0, 28.0, 'doi', 2],
  'realm_byzantine': [41.0, 28.9, 'doi', 2],
  'realm_great-horde': [48.7, 44.5, 'thao-nguyen', 0],
  'realm_crimea': [45.2, 34.0, 'thao-nguyen', 1],
  'realm_kazan': [55.8, 49.1, 'rung', 0],
  'realm_astrakhan': [46.3, 48.0, 'thao-nguyen', 0],

  // --- Tỉnh trong Đế quốc ---
  'prov_swabia': [48.5, 9.5, 'doi', 2],
  'prov_bayern': [48.5, 11.8, 'doi', 2],
  'prov_franken': [49.7, 10.6, 'doi', 2],
  'prov_wurttemberg': [48.7, 9.2, 'doi', 2],
  'prov_baden': [48.7, 8.2, 'doi', 2],
  'prov_rung-den': [48.2, 8.2, 'rung', 1],
  'prov_alsace': [48.4, 7.5, 'dong-bang', 2],
  'prov_palatinate': [49.4, 8.1, 'dong-bang', 2],
  'prov_mainz': [50.0, 8.3, 'song', 3],
  'prov_trier': [49.75, 6.65, 'doi', 2],
  'prov_cologne': [50.9, 6.95, 'dong-bang', 3],
  'prov_hessen': [50.6, 9.0, 'doi', 2],
  'prov_saxony': [51.1, 13.0, 'doi', 2],
  'prov_brandenburg': [52.4, 13.0, 'dong-bang', 2],
  'prov_pomerania': [53.8, 15.0, 'dong-bang', 1],
  'prov_bo-bien-baltic': [54.0, 11.0, 'bien', 2],
  'prov_bohemia': [50.0, 14.4, 'doi', 2],
  'prov_ao': [48.2, 15.5, 'doi', 2],
  'prov_luu-vuc-rhine': [50.0, 7.6, 'song', 3],

  // --- Thành trì trong Đế quốc ---
  'hold_ehrenfeld': [48.4, 9.8, 'doi', 2],
  'hold_brogg': [48.3, 9.6, 'doi', 1],
  'hold_muhldorf': [48.25, 12.5, 'dong-bang', 2],
  'hold_augsburg': [48.37, 10.9, 'dong-bang', 3],
  'hold_nuremberg': [49.45, 11.08, 'doi', 3],
  'hold_regensburg': [49.02, 12.1, 'song', 3],
  'hold_frankfurt': [50.11, 8.68, 'song', 3],
  'hold_mainz': [50.0, 8.27, 'song', 3],
  'hold_trier': [49.75, 6.64, 'song', 2],
  'hold_cologne': [50.94, 6.96, 'song', 3],
  'hold_aachen': [50.78, 6.08, 'doi', 3],
  'hold_strasbourg': [48.58, 7.75, 'song', 3],
  'hold_lubeck': [53.87, 10.69, 'bien', 3],
  'hold_hamburg': [53.55, 9.99, 'bien', 3],
  'hold_vienna': [48.21, 16.37, 'song', 3],

  // --- Pháp ---
  'prov_champagne': [48.6, 4.3, 'dong-bang', 2],
  'prov_normandy': [49.1, 0.1, 'dong-bang', 2],
  'prov_brittany': [48.2, -3.0, 'doi', 1],
  'prov_anjou': [47.5, -0.55, 'dong-bang', 2],
  'prov_orleans': [47.9, 1.9, 'dong-bang', 2],
  'prov_bourbon': [46.5, 3.3, 'doi', 2],
  'prov_aquitaine': [44.8, -0.6, 'dong-bang', 2],
  'prov_languedoc': [43.6, 3.0, 'doi', 2],
  'prov_avignon': [43.95, 4.8, 'doi', 2],
  'hold_troyes': [48.3, 4.08, 'dong-bang', 3],
  'hold_chinon': [47.17, 0.24, 'doi', 2],
  'hold_mont-saint-michel': [48.64, -1.51, 'bien', 1],
  'hold_carcassonne': [43.21, 2.35, 'doi', 2],
  'hold_orleans': [47.9, 1.9, 'song', 3],
  'hold_avignon': [43.95, 4.81, 'song', 3],

  // --- Burgundy, Thụy Sĩ ---
  'prov_low-countries': [51.0, 4.5, 'dam-lay', 3],
  'prov_thanh-bang-ngam-lun': [46.5, 8.0, 'nui', 0],

  // --- Ottoman và Đông La Mã ---
  'prov_rumelia': [41.7, 26.5, 'doi', 2],
  'prov_anatolia': [39.5, 32.0, 'doi', 1],
  'hold_edirne': [41.68, 26.56, 'dong-bang', 3],
  'hold_gallipoli': [40.41, 26.67, 'bien', 2],
  'hold_varna': [43.2, 27.9, 'bien', 2],
  'hold_bursa': [40.19, 29.06, 'doi', 2],
  'prov_morea': [37.5, 22.4, 'nui', 1],
  'hold_constantinople': [41.01, 28.98, 'bien', 3],

  // --- Đông Âu và thảo nguyên ---
  'prov_transylvania': [46.5, 24.5, 'nui', 1],
  'prov_mazovia': [52.3, 21.0, 'dong-bang', 1],
  'prov_zaporizhia': [47.9, 35.2, 'thao-nguyen', 0],
  'hold_ghenh-dnieper': [47.85, 35.0, 'song', 1],
  'hold_marienburg': [54.04, 19.03, 'dong-bang', 2],
  'hold_danzig': [54.35, 18.65, 'bien', 3],
  'hold_helsingor': [56.03, 12.6, 'bien', 2],
  'hold_gotland': [57.5, 18.5, 'bien', 1],
  'prov_bergslagen': [60.0, 15.0, 'rung', 1],
  'hold_sarai': [48.5, 45.5, 'thao-nguyen', 0],
  'hold_caffa': [45.03, 35.38, 'bien', 2],
  'hold_kazan-kremlin': [55.8, 49.1, 'song', 1],
  'hold_astrakhan': [46.35, 48.04, 'song', 1],

  // --- Bán đảo Iberia ---
  'hold_alhambra': [37.18, -3.59, 'nui', 2],
  'hold_gibraltar': [36.14, -5.35, 'bien', 1],

  // --- Đèo Alps ---
  'hold_mont-cenis': [45.25, 6.9, 'nui', 1],
};

/**
 * TUYẾN KHAI TAY — những con đường mà `adjacent` của `regions.json` không nói ra.
 *
 * `regions.json` khai LÁNG GIỀNG, mà láng giềng không phải đường đi: Venice và
 * Constantinople không kề nhau ở bất cứ nghĩa nào, nhưng một chiếc galley đi
 * giữa hai nơi ấy quanh năm, và một tin từ kinh đô tới Rialto nhanh hơn nhiều so
 * với đường bộ vòng qua Hungary. Đây là chỗ khai những tuyến ấy.
 */
const LANES = [
  // Đường biển Địa Trung Hải và Hắc Hải
  { a: 'hold_constantinople', b: 'realm_venice', kind: 'duong-bien' },
  { a: 'hold_constantinople', b: 'hold_caffa', kind: 'duong-bien' },
  { a: 'hold_constantinople', b: 'hold_gallipoli', kind: 'duong-bien' },
  { a: 'hold_constantinople', b: 'hold_varna', kind: 'duong-bien' },
  { a: 'hold_constantinople', b: 'prov_morea', kind: 'duong-bien' },
  { a: 'realm_venice', b: 'realm_genoa', kind: 'duong-bien' },
  { a: 'realm_genoa', b: 'realm_aragon', kind: 'duong-bien' },
  { a: 'realm_naples', b: 'realm_genoa', kind: 'duong-bien' },
  { a: 'hold_gibraltar', b: 'realm_portugal', kind: 'duong-bien' },
  { a: 'hold_gibraltar', b: 'realm_granada', kind: 'duong-bien' },

  // Đường biển Bắc Âu và Baltic — mạng lưới Hanse
  { a: 'hold_lubeck', b: 'hold_danzig', kind: 'duong-bien' },
  { a: 'hold_lubeck', b: 'hold_helsingor', kind: 'duong-bien' },
  { a: 'hold_helsingor', b: 'hold_gotland', kind: 'duong-bien' },
  { a: 'hold_gotland', b: 'realm_livonia', kind: 'duong-bien' },
  { a: 'hold_gotland', b: 'realm_sweden', kind: 'duong-bien' },
  { a: 'hold_hamburg', b: 'realm_england', kind: 'duong-bien' },
  { a: 'realm_england', b: 'prov_low-countries', kind: 'duong-bien' },
  { a: 'realm_england', b: 'prov_normandy', kind: 'duong-bien' },
  { a: 'realm_england', b: 'prov_brittany', kind: 'duong-bien' },
  { a: 'realm_norway', b: 'realm_scotland', kind: 'duong-bien' },

  // Đường sông — Rhine, Danube, Volga
  { a: 'prov_luu-vuc-rhine', b: 'hold_cologne', kind: 'duong-song' },
  { a: 'prov_luu-vuc-rhine', b: 'hold_mainz', kind: 'duong-song' },
  { a: 'prov_luu-vuc-rhine', b: 'hold_strasbourg', kind: 'duong-song' },
  { a: 'hold_regensburg', b: 'hold_vienna', kind: 'duong-song' },
  { a: 'hold_vienna', b: 'realm_hungary', kind: 'duong-song' },
  { a: 'hold_sarai', b: 'hold_astrakhan', kind: 'duong-song' },
  { a: 'hold_kazan-kremlin', b: 'hold_sarai', kind: 'duong-song' },

  // Đường cái lớn — con đường hành hương và đường thương nhân
  { a: 'realm_papal', b: 'realm_florence', kind: 'duong-cai' },
  { a: 'hold_augsburg', b: 'hold_mont-cenis', kind: 'duong-cai' },
  { a: 'hold_mont-cenis', b: 'realm_milan', kind: 'duong-nui' },
  { a: 'hold_troyes', b: 'hold_orleans', kind: 'duong-cai' },
  { a: 'hold_avignon', b: 'realm_papal', kind: 'duong-bien' },

  // Đèo Alps: ngắn trên bản đồ, đắt trên thực địa
  { a: 'prov_alps', b: 'realm_swiss', kind: 'duong-nui' },
  { a: 'prov_alps', b: 'realm_milan', kind: 'duong-nui' },
  { a: 'prov_alps', b: 'realm_savoy', kind: 'duong-nui' },
  { a: 'prov_alps', b: 'prov_ao', kind: 'duong-nui' },
];

const regionsFile = JSON.parse(readFileSync(path.join(root, 'data', 'regions.json'), 'utf8'));
const regions = regionsFile.regions ?? [];

/** Chiếu phẳng: gốc ở góc tây bắc, đơn vị km, x hướng đông, y hướng nam. */
const LON0 = -12;
const LAT0 = 62;
const KM_PER_LAT = 111;
/** cos(50°) — vĩ tuyến giữa của châu Âu, chỗ sai số của phép chiếu nhỏ nhất. */
const KM_PER_LON = 111 * Math.cos((50 * Math.PI) / 180);

const nodes = [];
const missing = [];

for (const region of regions) {
  // Lục địa không phải một NƠI: nó là gốc của cây vùng. Cho nó một toạ độ là
  // mở ra một cái cổng dịch chuyển tức thời giữa Lisboa và Moskva qua "châu Âu".
  if (region.kind === 'continent') continue;

  const row = BANG[region.id];
  if (row === undefined) {
    missing.push(region.id);
    continue;
  }

  const [lat, lon, terrain, roads] = row;
  nodes.push({
    id: region.id,
    name: region.name,
    x: Math.round((lon - LON0) * KM_PER_LON),
    y: Math.round((LAT0 - lat) * KM_PER_LAT),
    terrain,
    roads,
  });
}

if (missing.length > 0) {
  console.error(`THIẾU TOẠ ĐỘ cho ${missing.length} vùng:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

const known = new Set(nodes.map((node) => node.id));
const badLanes = LANES.filter((lane) => !known.has(lane.a) || !known.has(lane.b));
if (badLanes.length > 0) {
  console.error(`TUYẾN TRỎ VÀO VÙNG KHÔNG CÓ THẬT:\n  ${badLanes.map((lane) => `${lane.a} → ${lane.b}`).join('\n  ')}`);
  process.exit(1);
}

const output = {
  $schema: './world-map.schema.json',
  $comment:
    'BẢN ĐỒ ĐO ĐƯỜNG ĐI — Phần 15 mục 6. SINH TỰ ĐỘNG bởi tools/tao-ban-do.mjs, đừng sửa tay: sửa bảng toạ độ trong script ấy rồi chạy lại. Toạ độ tính bằng KM trên một phép chiếu phẳng, gốc ở góc tây bắc châu Âu. Cạnh của đồ thị KHÔNG nằm ở đây — chúng suy ra lúc chạy từ `adjacent` và `parentId` của regions.json, cộng với `lanes` bên dưới. Lục địa reg_europa cố ý KHÔNG có mặt: nó là gốc của cây vùng chứ không phải một nơi chốn, và cho nó toạ độ là biến nó thành đường tắt nối mọi thứ với mọi thứ.',
  version: 1,
  config: {
    $comment:
      '`terrainFactor` và `roadFactor` nhân vào tốc độ của người đưa tin. `laneFactor` áp cho tuyến khai tay, và nó THAY cho địa hình chứ không cộng thêm: một chiếc galley đi Venice–Constantinople không quan tâm giữa đường có núi hay không.',
    terrainFactor: {
      'dong-bang': 1.0,
      song: 1.15,
      doi: 0.85,
      'thao-nguyen': 0.9,
      rung: 0.7,
      'dam-lay': 0.6,
      bien: 0.8,
      nui: 0.45,
    },
    roadFactor: [0.6, 0.8, 1.0, 1.2],
    laneFactor: {
      'duong-cai': 1.25,
      'duong-song': 1.1,
      'duong-bien': 0.95,
      'duong-nui': 0.5,
    },
    /** Mùa đông đường lầy, đèo đóng, biển động (mục 6). */
    seasonFactor: { xuan: 1.0, ha: 1.1, thu: 0.95, dong: 0.6 },
    /**
     * Cạnh cha–con: một thành trì nối vào tỉnh của nó, một tỉnh nối vào lãnh thổ.
     * Đây không phải một con đường có thật mà là "đi từ làng ra tới đường cái",
     * nên nó chậm hơn đường cái nhưng vẫn luôn tồn tại.
     */
    hierarchyFactor: 0.9,
    /** Hai vùng không có tuyến nào nối: đi băng đồng, và trả giá. */
    fallbackFactor: 0.35,
  },
  lanes: LANES,
  nodes: nodes.sort((left, right) => left.id.localeCompare(right.id)),
};

writeFileSync(path.join(root, 'data', 'world-map.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Đã ghi data/world-map.json — ${nodes.length} vùng, ${LANES.length} tuyến khai tay.`);
