/**
 * ĐỌC THẺ TRONG VĂN BẢN AI TRẢ VỀ.
 *
 * Ba thẻ, cùng một cú pháp với `<RequestInjury>` của Phần 7 mục 3 — cùng dấu
 * `<Request…/>`, cùng kiểu thuộc tính, cùng cách nhận cả tên tiếng Anh lẫn tên
 * tiếng Việt. Một cú pháp cho mọi lời đề nghị nghĩa là người viết prompt học một
 * lần, và một model gõ nhầm `vung=` sang `noi=` vẫn rơi vào đúng chỗ tra cứu.
 *
 *   <RequestDuel   loai="dau-danh-du" doi-thu="Ser Aymer" trinh-do="hơn"
 *                  mo-ta="hiệp sĩ giáp tấm" noi="sân trước nhà thờ" cuoc="danh dự em gái anh" />
 *   <RequestBattle doi-thu="Đoàn cướp biên" quy-mo="vừa" the="thủ" noi="sườn đồi" />
 *   <RequestSiege  thanh="Lâu đài Montfort" ben="vây" quy-mo="lớn" trinh-do="ngang cơ" />
 *
 * FILE NÀY KHÔNG BIẾT MINIGAME LÀ GÌ. Nó chỉ đổi chữ thành `EncounterRequest`.
 * Chỗ phán quyết — có cho hay không, dựng ra cái gì — nằm ở `build.ts`, đúng
 * cách Phần 7 tách `parseInjuryRequests` khỏi `applyInjuryRequests`.
 */

import type { EncounterKind, EncounterRequest, PowerTier, ScaleTier, StandSide } from './types';

const TAG_PATTERN = /<Request(Duel|Battle|Siege)\b([^>]*?)\/?>/gi;
const ATTR_PATTERN = /([\w-]+)\s*=\s*"([^"]*)"|([\w-]+)\s*=\s*'([^']*)'/g;

type AttrKey =
  | 'kind'
  | 'foe'
  | 'description'
  | 'relation'
  | 'commander'
  | 'power'
  | 'scale'
  | 'side'
  | 'place'
  | 'stakes';

/** Tên thuộc tính nhận được. Prompt viết tiếng Việt, nên tiếng Việt đứng trước. */
const ATTR_ALIASES: Readonly<Record<string, AttrKey>> = {
  loai: 'kind',
  'loai-hinh': 'kind',
  kieu: 'kind',
  kind: 'kind',

  'doi-thu': 'foe',
  dich: 'foe',
  thanh: 'foe',
  'toa-thanh': 'foe',
  foe: 'foe',
  target: 'foe',

  'mo-ta': 'description',
  ta: 'description',
  desc: 'description',
  description: 'description',

  'quan-he': 'relation',
  relation: 'relation',

  'chu-soai': 'commander',
  tuong: 'commander',
  commander: 'commander',
  lord: 'commander',

  'trinh-do': 'power',
  'tuong-quan': 'power',
  suc: 'power',
  power: 'power',

  'quy-mo': 'scale',
  'co-quan': 'scale',
  scale: 'scale',
  size: 'scale',

  ben: 'side',
  the: 'side',
  phe: 'side',
  side: 'side',

  noi: 'place',
  'dia-diem': 'place',
  cho: 'place',
  place: 'place',

  cuoc: 'stakes',
  'duoc-mat': 'stakes',
  vi: 'stakes',
  stakes: 'stakes',
};

/**
 * Bỏ dấu và gạch nối hóa, để `"ngang cơ"`, `"Ngang Cơ"` và `"ngang-co"` là một.
 *
 * Model viết tiếng Việt có dấu vì prompt viết tiếng Việt có dấu; id trong data
 * thì không dấu. Không có hàm này thì mọi thuộc tính đều phải khai hai lần.
 */
export function fold(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Từ điển bốn nấc tương quan.
 *
 * Nhận cả cách nói vòng ("trên cơ", "áp đảo") vì người kể chuyện viết văn chứ
 * không điền biểu mẫu. Chữ lạ thì `powerOf` trả `null` và bên gọi hạ về nấc
 * THẤP NHẤT — cùng luật với mức độ thương tích của Phần 7 mục 3: một chữ gõ sai
 * không được phép mua thêm nguy hiểm cho người chơi.
 */
const POWER_WORDS: Readonly<Record<string, PowerTier>> = {
  'kem-hon': 'kem-hon',
  kem: 'kem-hon',
  'yeu-hon': 'kem-hon',
  yeu: 'kem-hon',
  non: 'kem-hon',
  'duoi-co': 'kem-hon',
  'tap-su': 'kem-hon',

  'ngang-co': 'ngang-co',
  ngang: 'ngang-co',
  'ngang-tay': 'ngang-co',
  'ngang-suc': 'ngang-co',
  'tuong-duong': 'ngang-co',
  'ke-tam-lang': 'ngang-co',

  hon: 'hon',
  'hon-mot-bac': 'hon',
  'manh-hon': 'hon',
  'gioi-hon': 'hon',
  'tren-co': 'hon',
  'day-dan': 'hon',

  'vuot-xa': 'vuot-xa',
  'ap-dao': 'vuot-xa',
  'hon-han': 'vuot-xa',
  'vuot-troi': 'vuot-xa',
  'khong-the-thang': 'vuot-xa',
  'huyen-thoai': 'vuot-xa',
};

const SCALE_WORDS: Readonly<Record<string, ScaleTier>> = {
  nho: 'nho',
  'nho-le': 'nho',
  'le-te': 'nho',
  'mot-nhum': 'nho',
  'cham-tran': 'nho',

  vua: 'vua',
  'vua-phai': 'vua',
  'trung-binh': 'vua',
  thuong: 'vua',

  lon: 'lon',
  to: 'lon',
  'rat-lon': 'lon',
  'khong-lo': 'lon',
  'toan-luc': 'lon',
  'quyet-chien': 'lon',
};

const SIDE_WORDS: Readonly<Record<string, StandSide>> = {
  cong: 'cong',
  'tan-cong': 'cong',
  vay: 'cong',
  'vay-ham': 'cong',
  'cong-thanh': 'cong',
  'chu-dong': 'cong',

  thu: 'thu',
  'phong-thu': 'thu',
  'thu-thanh': 'thu',
  'cu-thu': 'thu',
  'trong-tuong': 'thu',
  'bi-vay': 'thu',
};

export function powerOf(text: string): PowerTier | null {
  return POWER_WORDS[fold(text)] ?? null;
}

export function scaleOf(text: string): ScaleTier | null {
  return SCALE_WORDS[fold(text)] ?? null;
}

export function sideOf(text: string): StandSide | null {
  return SIDE_WORDS[fold(text)] ?? null;
}

/** Lời mời chưa qua kiểm duyệt, kèm những chữ engine không hiểu. */
export interface ParsedRequest {
  request: EncounterRequest;
  /** Thuộc tính có mặt nhưng viết bằng chữ lạ — bên gọi hạ về nấc thấp nhất. */
  unknown: AttrKey[];
}

function kindOfTag(tag: string): EncounterKind {
  const lowered = tag.toLowerCase();
  if (lowered === 'battle') return 'battle';
  if (lowered === 'siege') return 'siege';
  return 'duel';
}

/**
 * Đọc mọi thẻ trong một câu trả lời, theo thứ tự xuất hiện.
 *
 * Thẻ THIẾU thuộc tính vẫn đọc được: `power` vắng mặt nghĩa là "một trận cân
 * sức", `scale` vắng mặt nghĩa là "vừa". Chỉ có chữ LẠ mới bị hạ nấc, và nó
 * được ghi vào `unknown` để bên gọi nói ra lý do thay vì lặng lẽ đổi.
 */
export function parseEncounterRequests(raw: string): ParsedRequest[] {
  const parsed: ParsedRequest[] = [];
  TAG_PATTERN.lastIndex = 0;

  for (let match = TAG_PATTERN.exec(raw); match !== null; match = TAG_PATTERN.exec(raw)) {
    const kind = kindOfTag(match[1] ?? '');
    const attributes = match[2] ?? '';
    const found: Partial<Record<AttrKey, string>> = {};

    ATTR_PATTERN.lastIndex = 0;
    for (let attr = ATTR_PATTERN.exec(attributes); attr !== null; attr = ATTR_PATTERN.exec(attributes)) {
      const key = (attr[1] ?? attr[3] ?? '').toLowerCase();
      const value = attr[2] ?? attr[4] ?? '';
      const canonical = ATTR_ALIASES[key] ?? ATTR_ALIASES[fold(key)];
      if (canonical !== undefined) found[canonical] = value;
    }

    const unknown: AttrKey[] = [];

    const powerWord = found['power'];
    let power: PowerTier = 'ngang-co';
    if (powerWord !== undefined && powerWord.trim() !== '') {
      const read = powerOf(powerWord);
      if (read === null) unknown.push('power');
      else power = read;
    }

    const scaleWord = found['scale'];
    let scale: ScaleTier = 'vua';
    if (scaleWord !== undefined && scaleWord.trim() !== '') {
      const read = scaleOf(scaleWord);
      if (read === null) unknown.push('scale');
      else scale = read;
    }

    const sideWord = found['side'];
    // Mặc định là bên CHỦ ĐỘNG: một trận nổ ra trong truyện mà không ai nói rõ
    // thì người chơi là người đi tới, không phải người bị dồn vào chân tường.
    let side: StandSide = 'cong';
    if (sideWord !== undefined && sideWord.trim() !== '') {
      const read = sideOf(sideWord);
      if (read === null) unknown.push('side');
      else side = read;
    }

    parsed.push({
      request: {
        kind,
        kindId: (found['kind'] ?? '').trim(),
        foe: (found['foe'] ?? '').trim(),
        description: (found['description'] ?? '').trim(),
        relation: (found['relation'] ?? '').trim(),
        commander: (found['commander'] ?? '').trim(),
        power,
        scale,
        side,
        place: (found['place'] ?? '').trim(),
        stakes: (found['stakes'] ?? '').trim(),
      },
      unknown,
    });
  }

  return parsed;
}

/** Bỏ thẻ khỏi đoạn văn trước khi hiện cho người chơi — họ đọc truyện, không đọc thẻ. */
export function stripEncounterRequests(raw: string): string {
  return raw.replace(TAG_PATTERN, '').trim();
}
