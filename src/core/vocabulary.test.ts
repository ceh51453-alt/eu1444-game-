/**
 * Gác từ vựng bắt buộc của README mục 6.
 *
 * "LÃNH ĐỊA" bị cấm tuyệt đối trong mọi prompt, mọi UI, mọi tên biến, mọi file
 * data — vì tiếng Việt dùng từ đó cho cả THÀNH TRÌ, LÃNH THỔ lẫn THÁI ẤP, nên
 * nó là nguồn lẫn nặng nhất của cả dự án. Luật không có người gác thì đến Phần
 * 14 sẽ có vài trăm chỗ vi phạm và không ai gỡ nổi nữa.
 *
 * HAI RANH GIỚI CỦA BỘ GÁC NÀY, cả hai đều rút ra từ va vấp thật:
 *
 * 1. So khớp SAU KHI BỎ DẤU chỉ dùng cho cụm một từ ghép có thể xuất hiện
 *    trong tên biến (`lanhDia`, `lanh_dia`). Với cụm nhiều từ thì bỏ dấu là
 *    tự gây báo nhầm: "cô ngồi" bỏ dấu ra đúng bằng "cơ ngơi".
 *
 * 2. Preset và lorebook người chơi TỰ MANG VÀO không làm test đỏ. Đó là nội
 *    dung của họ, mình không sửa được, và làm hỏng build vì nó là sai chỗ.
 *    Vẫn quét và IN RA để họ biết, nhưng không chặn.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/** Thư mục do dự án tự viết — vi phạm ở đây là test đỏ. */
const AUTHORED_DIRS = ['src', 'data', 'prompts'];

/** Nội dung người chơi mang vào — chỉ báo, không chặn. */
const USER_CONTENT_DIRS = ['presets', 'lorebooks'];

const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.json', '.ejs', '.css', '.md', '.html']);

/**
 * Hai file phải VIẾT RA từ cấm thì mới cấm được nó: bộ gác này, và khối prompt
 * số 2 — chỗ dạy cho AI biết bốn cụm nào không được dùng. Không có danh sách đó
 * trong prompt thì AI không có cách nào biết mình đang vi phạm.
 */
const EXEMPT_FILES = new Set([
  join('src', 'core', 'vocabulary.test.ts'),
  join('prompts', '02-luat-bat-bien.ejs'),
]);

interface BannedPhrase {
  /** Dạng có dấu, dùng để so khớp chính. */
  phrase: string;
  /**
   * Dạng bỏ dấu, chỉ đặt khi cụm đó có thể xuất hiện trong TÊN BIẾN.
   * Cụm nhiều từ để `undefined` — bỏ dấu là báo nhầm.
   */
  undiacritized?: string;
  why: string;
}

const BANNED_PHRASES: readonly BannedPhrase[] = [
  {
    phrase: 'lãnh địa',
    undiacritized: 'lanh dia',
    why: 'lẫn cả ba tầng — dùng THÀNH TRÌ / LÃNH THỔ / THÁI ẤP',
  },
  { phrase: 'đất đai của ngài', why: 'mơ hồ giữa thành trì và lãnh thổ' },
  { phrase: 'vùng đất của ngài', why: 'mơ hồ giữa thành trì và lãnh thổ' },
  { phrase: 'cơ ngơi', why: 'mơ hồ giữa thành trì và thái ấp' },
];

/**
 * Hạ chữ thường và gộp dấu ngăn cách, GIỮ NGUYÊN dấu tiếng Việt.
 * Tách luôn camelCase để bắt được tên biến kiểu `lanhDia`.
 */
function normalise(text: string): string {
  return text
    .replace(/([\p{Ll}0-9])(\p{Lu})/gu, '$1 $2')
    .toLowerCase()
    .replace(/[_\-.\s]+/g, ' ');
}

/** Bỏ dấu tiếng Việt. Chỉ dùng cho cụm một từ ghép (xem ghi chú ở đầu file). */
function stripDiacritics(text: string): string {
  return normalise(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

function matches(line: string, banned: BannedPhrase): boolean {
  if (normalise(line).includes(normalise(banned.phrase))) return true;
  if (banned.undiacritized === undefined) return false;
  return stripDiacritics(line).includes(banned.undiacritized);
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // Thư mục chưa tồn tại (ví dụ /prompts trước Phần 3).
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SCANNED_EXTENSIONS.has(extname(full))) out.push(full);
  }
  return out;
}

function filesIn(dirs: readonly string[]): string[] {
  return dirs
    .flatMap((dir) => walk(join(REPO_ROOT, dir)))
    .map((file) => relative(REPO_ROOT, file))
    .filter((file) => !EXEMPT_FILES.has(file));
}

/**
 * MỘT DÒNG ĐÃ CHUẨN HÓA SẴN, đọc và biến đổi ĐÚNG MỘT LẦN cho cả bốn cụm cấm.
 *
 * Không có bộ nhớ đệm này thì mỗi cụm cấm là một lượt đọc lại toàn bộ cây mã cộng
 * một lượt chạy `normalise` trên từng dòng, và chi phí ấy nhân lên theo từng phần
 * mới: tới Phần 14 thì bộ gác quét 3,8 MB nội dung người chơi bốn lần và chạm trần
 * 5 giây của vitest — nó đỏ vì HẾT GIỜ chứ không vì có từ cấm, và đó là kiểu đỏ tệ
 * nhất, vì nó dạy người ta bỏ qua màu đỏ.
 */
interface ScannedLine {
  raw: string;
  normalised: string;
  stripped: string;
}

const SCAN_CACHE = new Map<string, ScannedLine[]>();

function scannedOf(file: string): ScannedLine[] {
  const cached = SCAN_CACHE.get(file);
  if (cached !== undefined) return cached;
  const lines = readFileSync(join(REPO_ROOT, file), 'utf8')
    .split(/\r?\n/)
    .map((raw) => ({ raw, normalised: normalise(raw), stripped: stripDiacritics(raw) }));
  SCAN_CACHE.set(file, lines);
  return lines;
}

function hits(line: ScannedLine, banned: BannedPhrase): boolean {
  if (line.normalised.includes(normalise(banned.phrase))) return true;
  if (banned.undiacritized === undefined) return false;
  return line.stripped.includes(banned.undiacritized);
}

function findOffenders(files: readonly string[], banned: BannedPhrase): string[] {
  const offenders: string[] = [];
  for (const file of files) {
    scannedOf(file).forEach((line, index) => {
      if (hits(line, banned)) {
        offenders.push(`${file.split(sep).join('/')}:${index + 1}: ${line.raw.trim().slice(0, 120)}`);
      }
    });
  }
  return offenders;
}

describe('từ vựng bắt buộc (README mục 6)', () => {
  const authored = filesIn(AUTHORED_DIRS);

  it('có gì để quét', () => {
    expect(authored.length).toBeGreaterThan(20);
  });

  it.each(BANNED_PHRASES)('mã nguồn không dùng "$phrase" — $why', (banned) => {
    expect(findOffenders(authored, banned)).toEqual([]);
  });

  it('bỏ dấu chỉ áp cho cụm có thể thành tên biến', () => {
    const lanhDia = BANNED_PHRASES[0]!;
    for (const variant of ['LÃNH ĐỊA', 'lãnh địa', 'Lanh Dia', 'lanh_dia', 'lãnh-địa', 'lanhDia']) {
      expect(matches(variant, lanhDia), variant).toBe(true);
    }
    // Cụm nhiều từ KHÔNG bỏ dấu, nếu không sẽ báo nhầm.
    expect(BANNED_PHRASES.filter((banned) => banned.undiacritized !== undefined)).toHaveLength(1);
  });

  it('không bắt nhầm những từ hợp lệ', () => {
    const allowed = [
      'lãnh thổ',
      'thành trì',
      'thái ấp',
      'lãnh chúa',
      'địa hình',
      // Đây là chỗ bộ gác từng báo nhầm: bỏ dấu ra đúng bằng "cơ ngơi".
      'cô ngồi trên chiếc bàn này',
      'cơ nghiệp',
      'lành lặn',
    ];
    for (const text of allowed) {
      for (const banned of BANNED_PHRASES) {
        expect(matches(text, banned), `"${text}" bị bắt nhầm bởi "${banned.phrase}"`).toBe(false);
      }
    }
  });

  it('nội dung người chơi mang vào chỉ được BÁO, không làm test đỏ', () => {
    const userFiles = filesIn(USER_CONTENT_DIRS);
    const report: string[] = [];

    for (const banned of BANNED_PHRASES) {
      const offenders = findOffenders(userFiles, banned);
      if (offenders.length > 0) {
        report.push(`"${banned.phrase}" xuất hiện ${offenders.length} lần:`);
        for (const offender of offenders.slice(0, 5)) report.push(`   ${offender}`);
      }
    }

    if (report.length > 0) {
      console.log(
        `\nCHÚ Ý — preset/lorebook người chơi mang vào có dùng từ bị cấm.\nEngine không sửa nội dung của họ, nhưng những từ này sẽ đi thẳng vào prompt:\n${report.join('\n')}`,
      );
    }
    // Không assert: đây là cảnh báo, không phải cổng chặn.
    expect(Array.isArray(report)).toBe(true);
  }, 15_000);
});
