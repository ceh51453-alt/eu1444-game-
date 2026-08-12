/**
 * TẦNG 1 CỦA KIẾN TRÚC LAI (Phần 9 mục 1) — DOCTRINE.
 *
 * Mục 1 mở đầu bằng một lệnh cấm: KHÔNG gọi LLM cho từng đòn. Một trận 8–25
 * hiệp mà mỗi hiệp một lời gọi thì người chơi ngồi chờ vài phút và trả tiền cho
 * hai mươi lăm request để nhận về những câu "hắn chém xuống". Nên LLM được gọi
 * ĐÚNG MỘT LẦN lúc vào trận, và trả về một tính cách chiến đấu — sau đó engine
 * tự chạy.
 *
 * File này CỐ Ý không biết gọi LLM. Nó chỉ dựng prompt và đọc lại câu trả lời.
 * Người gọi (UI, hoặc `engine.ts`) mới là chỗ có `LLMProvider` và `ConnCfg`.
 * Nhờ vậy toàn bộ bài test 200 trận của mục 12.10 chạy được offline: nó nạp
 * doctrine mẫu ở `ARCHETYPES` và không chạm vào mạng lần nào.
 *
 * FALLBACK KHÔNG BAO GIỜ ĐƯỢC HỎNG (R4). Proxy chết, JSON méo, mô hình trả về
 * một đoạn văn — cả ba đều rơi về `DEFAULT_DOCTRINE`, và trận đấu vẫn đánh
 * được. Một minigame không mở lên được vì AI trả sai schema là đúng thứ R4 cấm.
 */

import { z } from 'zod';
import type { DuelState, Fighter, SideId } from './types';
import { allActions, actionOf } from './data';

export const doctrineSchema = z.object({
  /** 0 = chờ đối thủ ra đòn trước; 1 = lao vào ngay từ hiệp một. */
  aggression: z.number().min(0).max(1).default(0.5),
  /** 0 = sốt ruột, đánh liều khi bế tắc; 1 = sẵn sàng đi vòng hai mươi hiệp. */
  patience: z.number().min(0).max(1).default(0.5),
  /** 0 = hất cát vào mắt; 1 = không đánh người đã ngã. */
  honor: z.number().min(0).max(1).default(0.5),
  /** 0 = chỉ chọn đòn chắc ăn; 1 = đổi đòn nặng lấy nguy cơ ăn đòn. */
  riskTolerance: z.number().min(0).max(1).default(0.5),
  /** Nhắm vào chỗ đã bị thương của đối thủ. */
  targetsWounded: z.boolean().default(true),
  /** Có dừng lại khi đối thủ kêu hàng không. */
  respectsYield: z.boolean().default(true),
  /** Đòn ưa dùng, bằng lời hoặc bằng id. Bộ chọn cộng điểm cho chúng. */
  favoredActions: z.array(z.string().max(40)).max(8).default([]),
  /** Một câu mở màn cho người kể chuyện dùng. Không ảnh hưởng cơ học. */
  openingLine: z.string().max(400).default(''),
});

export type Doctrine = z.infer<typeof doctrineSchema>;

export const DEFAULT_DOCTRINE: Doctrine = {
  aggression: 0.5,
  patience: 0.5,
  honor: 0.5,
  riskTolerance: 0.5,
  targetsWounded: true,
  respectsYield: true,
  favoredActions: [],
  openingLine: '',
};

/**
 * Doctrine mẫu — dùng khi không có LLM, và làm chỗ dựa cho bài test.
 *
 * Chúng KHÔNG phải là "độ khó dễ / vừa / khó". Mục 1 đòi đối thủ hung hãn, đối
 * thủ nhẫn nại và đối thủ chơi bẩn hành xử khác nhau RÕ RỆT — khác về cách
 * đánh, không khác về sức mạnh. Một tay chơi bẩn không mạnh hơn một hiệp sĩ; hắn
 * chỉ hất cát.
 */
export const ARCHETYPES: Readonly<Record<string, Doctrine>> = {
  'hung-han': {
    ...DEFAULT_DOCTRINE,
    aggression: 0.85,
    patience: 0.15,
    honor: 0.4,
    riskTolerance: 0.75,
    favoredActions: ['bo-doc', 'chem-cheo', 'buoc-toi'],
    openingLine: 'Hắn không chào. Hắn bước tới.',
  },
  'nhan-nai': {
    ...DEFAULT_DOCTRINE,
    aggression: 0.25,
    patience: 0.9,
    honor: 0.7,
    riskTolerance: 0.25,
    favoredActions: ['gat-huong', 'vong-trai', 'dam'],
    openingLine: 'Ông ta đứng yên, mũi kiếm chúc xuống, đợi.',
  },
  'choi-ban': {
    ...DEFAULT_DOCTRINE,
    aggression: 0.6,
    patience: 0.4,
    honor: 0.05,
    riskTolerance: 0.6,
    targetsWounded: true,
    respectsYield: false,
    favoredActions: ['hat-cat', 'vat-lon', 'chat-chan'],
    openingLine: 'Gã nhìn xuống đất trước khi nhìn vào mặt ngài.',
  },
  'hiep-si': {
    ...DEFAULT_DOCTRINE,
    aggression: 0.55,
    patience: 0.6,
    honor: 0.95,
    riskTolerance: 0.4,
    targetsWounded: false,
    respectsYield: true,
    favoredActions: ['chem-cheo', 'do-cung', 'dam'],
    openingLine: 'Ngài ấy cúi đầu đúng độ sâu mà nghi thức đòi hỏi, rồi mới rút kiếm.',
  },
  'ke-cuop': {
    ...DEFAULT_DOCTRINE,
    aggression: 0.7,
    patience: 0.2,
    honor: 0.15,
    riskTolerance: 0.85,
    respectsYield: false,
    favoredActions: ['dam', 'vat-lon', 'huc-khien'],
    openingLine: 'Hắn cười, và tiếng cười ấy là thứ duy nhất hắn nói.',
  },
};

export function archetype(id: string): Doctrine {
  return ARCHETYPES[id] ?? DEFAULT_DOCTRINE;
}

// ---------------------------------------------------------------------------
// Đòn ưa dùng: từ lời sang id
// ---------------------------------------------------------------------------

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * `["đâm", "vật lộn"]` → `["dam", "vat-lon"]`.
 *
 * Mục 1 in ví dụ doctrine bằng tiếng Việt có dấu, nên phải nhận được tiếng Việt
 * có dấu. Khớp theo id trước, rồi tới tên hành động, rồi tới nhãn — nhờ vế cuối
 * mà một doctrine ghi "chém" cộng điểm cho cả ba đường chém.
 */
export function resolveFavored(names: readonly string[]): string[] {
  const actions = allActions();
  const wanted = new Set<string>();

  for (const raw of names) {
    const key = fold(raw);
    if (key === '') continue;
    if (actionOf(key) !== null) {
      wanted.add(key);
      continue;
    }
    for (const action of actions) {
      if (fold(action.name) === key || action.tags.some((tag) => fold(tag) === key)) {
        wanted.add(action.id);
      }
    }
  }
  return [...wanted];
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export interface DoctrineRequest {
  system: string;
  user: string;
}

export interface DoctrineContext {
  /** Hồ sơ đối thủ bằng lời — chủng tộc, tước vị, tiếng tăm. */
  profile: string;
  /** Quan hệ với người chơi. */
  relation: string;
  /** Bối cảnh: vì sao hai người này đứng đối diện nhau. */
  situation: string;
  /** Thứ đang đặt cược. */
  stakes: string;
  /** Loại hình quyết đấu, tên tiếng Việt. */
  kind: string;
  /** Trang bị hai bên, để doctrine biết mình đang đối mặt với cái gì. */
  gear: string;
}

const SHAPE_HINT = [
  '{',
  '  "aggression": 0..1,      // lao vào hay chờ',
  '  "patience": 0..1,        // chịu đi vòng bao lâu',
  '  "honor": 0..1,           // 0 là hất cát vào mắt, 1 là không đánh người đã ngã',
  '  "riskTolerance": 0..1,   // đổi nguy cơ ăn đòn lấy đòn nặng',
  '  "targetsWounded": true|false,',
  '  "respectsYield": true|false,',
  '  "favoredActions": ["đâm", "vật lộn"],',
  '  "openingLine": "một câu tả cách hắn bước vào trận"',
  '}',
].join('\n');

/**
 * Prompt xin doctrine. Gọi ĐÚNG MỘT LẦN lúc vào trận.
 *
 * Nó KHÔNG hỏi AI "ai sẽ thắng", "đòn nào mạnh hơn", hay bất cứ con số cơ học
 * nào — đó là R1. Nó hỏi đúng một thứ mà AI giỏi hơn engine: người này là loại
 * người nào khi cầm vũ khí.
 */
export function doctrinePrompt(context: DoctrineContext): DoctrineRequest {
  const system = [
    'Ngài quyết định TÍNH CÁCH CHIẾN ĐẤU của một nhân vật trong một thế giới giả tưởng châu Âu thế kỷ 14.',
    '',
    'Trả về DUY NHẤT một khối JSON, không giải thích gì thêm, theo đúng hình dạng:',
    SHAPE_HINT,
    '',
    'LUẬT:',
    '1. Ngài KHÔNG quyết định ai thắng, không quyết định đòn nào trúng, không nêu một con số sát thương nào.',
    '2. Ngài chỉ tả CÁCH người này đánh nhau. Engine lo phần còn lại.',
    '3. `openingLine` viết bằng tiếng Việt, một câu, không quá hai dòng.',
    '4. `favoredActions` chọn trong: chém ngang, chém chéo, bổ dọc, đâm, đập, chặt chân, đỡ cứng, gạt hướng, né sang, lùi tránh, núp khiên, giả đòn, tước vũ khí, vật lộn, húc khiên, hất cát.',
  ].join('\n');

  const user = [
    `Loại hình: ${context.kind}`,
    `Đối thủ: ${context.profile}`,
    context.relation === '' ? '' : `Quan hệ với nhân vật người chơi: ${context.relation}`,
    context.situation === '' ? '' : `Bối cảnh: ${context.situation}`,
    context.stakes === '' ? '' : `Thứ đang đặt cược: ${context.stakes}`,
    context.gear === '' ? '' : `Trang bị: ${context.gear}`,
  ]
    .filter((line) => line !== '')
    .join('\n');

  return { system, user };
}

// ---------------------------------------------------------------------------
// Đọc lại câu trả lời
// ---------------------------------------------------------------------------

export interface DoctrineParse {
  doctrine: Doctrine;
  /** Đã phải lùi về mặc định vì câu trả lời không dùng được (R4). */
  fellBack: boolean;
  issue: string;
}

/** Lấy khối JSON đầu tiên trong một câu trả lời có thể lẫn cả văn xuôi. */
function extractJson(text: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  for (let index = start; index < body.length; index++) {
    const char = body[index];
    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return body.slice(start, index + 1);
    }
  }
  return null;
}

export function parseDoctrine(text: string): DoctrineParse {
  const json = extractJson(text);
  if (json === null) {
    return { doctrine: DEFAULT_DOCTRINE, fellBack: true, issue: 'không tìm thấy khối JSON nào trong câu trả lời' };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    return { doctrine: DEFAULT_DOCTRINE, fellBack: true, issue: `JSON hỏng: ${String(error)}` };
  }

  const parsed = doctrineSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      doctrine: DEFAULT_DOCTRINE,
      fellBack: true,
      issue: `doctrine sai schema ở "${issue?.path.join('.') ?? '?'}": ${issue?.message ?? 'không rõ'}`,
    };
  }

  return { doctrine: parsed.data, fellBack: false, issue: '' };
}

// ---------------------------------------------------------------------------
// Khúc ngoặt (mục 1)
// ---------------------------------------------------------------------------

export const MAX_LLM_CALLS = 3;

export type TurningPoint = 'sap-thua' | 'nguoi-choi-trong-thuong' | 'co-nguoi-can-thiep';

export const TURNING_POINT_LABELS: Readonly<Record<TurningPoint, string>> = {
  'sap-thua': 'đối thủ sắp thua',
  'nguoi-choi-trong-thuong': 'người chơi bị thương nặng',
  'co-nguoi-can-thiep': 'có người ngoài can thiệp',
};

function worstSeverity(fighter: Fighter): number {
  return fighter.body.injuries.reduce((max, injury) => Math.max(max, injury.severity), 0);
}

/**
 * Có đáng gọi LLM lần nữa không.
 *
 * Ba khúc ngoặt của mục 1, và KHÔNG có cái thứ tư. Trần cứng `MAX_LLM_CALLS`
 * đứng ở `engine.ts`; hàm này chỉ nói "chỗ này là một khúc ngoặt". Nếu để nó tự
 * quyết luôn cả việc gọi thì một trận dài sẽ chạm khúc ngoặt nhiều lần và cái
 * trần biến mất mà không ai sửa gì cả.
 */
export function turningPointFor(duel: DuelState, side: SideId): TurningPoint | null {
  const self = side === 'a' ? duel.a : duel.b;
  const foe = side === 'a' ? duel.b : duel.a;

  if (self.stamina < 25 || worstSeverity(self) >= 4) return 'sap-thua';
  if (foe.id === '' && worstSeverity(foe) >= 4) return 'nguoi-choi-trong-thuong';
  return null;
}
