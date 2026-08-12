/**
 * Tham số cấp cao nhất của preset SillyTavern → cấu hình kết nối của game.
 *
 * Trình import cũ chỉ CHÉP LẠI `temperature`, `top_p`… vào `samplerParams` để
 * export ra không mất trường. Không ai đọc chúng nữa, nên nạp một preset xong
 * thì mọi thanh trượt vẫn nằm ở mặc định của engine — người chơi tưởng preset
 * đã có hiệu lực trong khi nó chưa hề.
 *
 * Ở đây có hai việc tách bạch:
 *
 *  1. ĐỔI TÊN theo provider. `top_p` của OpenAI là `topP` của Gemini; Anthropic
 *     không có `frequency_penalty` nào cả. Đổ thẳng tên của SillyTavern vào là
 *     gửi đi những trường mà API sẽ trả 400.
 *
 *  2. TÁCH HAI CON SỐ TOKEN. `openai_max_context` là CỬA SỔ NGỮ CẢNH (đầu vào,
 *     2.000.000 trong preset mẫu) còn `openai_max_tokens` là TRẦN ĐẦU RA
 *     (65.000). Nhập nhèm hai cái là lỗi nặng nhất trong nhóm này: lấy 2 triệu
 *     làm trần đầu ra thì mọi request đều bị API từ chối, còn lấy 65k làm cửa sổ
 *     ngữ cảnh thì prompt bị cắt mất ba phần tư mà không ai hiểu vì sao.
 */

import { getProvider, type ParamSpec, type ProviderId } from '../provider';
import type { SillyTavernPreset } from './schema';

/**
 * Mọi tham số lấy mẫu mà SillyTavern ghi ở cấp cao nhất.
 *
 * Danh sách này tồn tại để BÁO CÁO cho đủ: provider nào không có tham số nào thì
 * phải nói ra tên nó. Chỉ duyệt qua bảng đổi tên của provider thì `frequency_penalty`
 * của một preset chạy trên Anthropic sẽ biến mất không một dòng nào, và người
 * chơi tưởng nó đã có hiệu lực.
 */
const ST_PARAM_NAMES = [
  'temperature',
  'top_p',
  'top_k',
  'top_a',
  'min_p',
  'repetition_penalty',
  'frequency_penalty',
  'presence_penalty',
  'seed',
  'n',
  'reasoning_effort',
  'verbosity',
] as const;

/** Tên tham số của SillyTavern → tên của từng provider. */
const NAME_MAP: Record<ProviderId, Record<string, string>> = {
  openai: {
    temperature: 'temperature',
    top_p: 'top_p',
    top_k: 'top_k',
    top_a: 'top_a',
    min_p: 'min_p',
    repetition_penalty: 'repetition_penalty',
    frequency_penalty: 'frequency_penalty',
    presence_penalty: 'presence_penalty',
    seed: 'seed',
    n: 'n',
    reasoning_effort: 'reasoning_effort',
    verbosity: 'verbosity',
  },
  custom: {
    temperature: 'temperature',
    top_p: 'top_p',
    top_k: 'top_k',
    top_a: 'top_a',
    min_p: 'min_p',
    repetition_penalty: 'repetition_penalty',
    frequency_penalty: 'frequency_penalty',
    presence_penalty: 'presence_penalty',
    seed: 'seed',
    n: 'n',
    reasoning_effort: 'reasoning_effort',
    verbosity: 'verbosity',
  },
  gemini: {
    temperature: 'temperature',
    top_p: 'topP',
    top_k: 'topK',
    reasoning_effort: 'thinkingLevel',
  },
  anthropic: {
    temperature: 'temperature',
    top_p: 'top_p',
    top_k: 'top_k',
  },
};

/** `reasoning_effort` của SillyTavern → `thinkingLevel` của Gemini. */
const THINKING_LEVEL: Record<string, string> = {
  none: 'OFF',
  off: 'OFF',
  minimal: 'LOW',
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
  max: 'HIGH',
  auto: 'HIGH',
};

export interface PresetTuning {
  /** Đã đổi tên và ép về đúng miền của provider. */
  params: Record<string, unknown>;
  /** `stream_openai`. `undefined` = preset không nói gì, giữ nguyên cài đặt cũ. */
  stream: boolean | undefined;
  /**
   * Hai trần token. Chúng KHÔNG bao giờ là một con số:
   * `input` là cửa sổ ngữ cảnh, `output` là số token được phép sinh ra.
   */
  tokens: { input?: number; output?: number };
  /** Cho báo cáo import: mỗi dòng là một quyết định đã ra. */
  applied: string[];
  ignored: string[];
}

function clampToSpec(
  spec: ParamSpec,
  value: number,
  stName: string,
  notes: string[],
): number {
  let out = value;
  if (spec.min !== undefined && out < spec.min) out = spec.min;
  if (spec.max !== undefined && out > spec.max) out = spec.max;
  if (spec.kind === 'integer') out = Math.round(out);
  if (out !== value) {
    notes.push(`${stName}: ${value} → ${out} (ngoài miền cho phép của ${spec.key})`);
  }
  return out;
}

/**
 * Đọc tham số của preset ra thành cấu hình kết nối cho một provider cụ thể.
 *
 * KHÔNG ghi vào đâu cả — người gọi quyết định áp vào hồ sơ nào.
 */
export function tuneFromPreset(source: SillyTavernPreset, providerId: ProviderId): PresetTuning {
  const provider = getProvider(providerId);
  const specs = new Map(provider.paramSpecs.map((spec) => [spec.key, spec] as const));
  const map = NAME_MAP[providerId];

  const params: Record<string, unknown> = {};
  const applied: string[] = [];
  const ignored: string[] = [];

  for (const stName of ST_PARAM_NAMES) {
    const raw = (source as Record<string, unknown>)[stName];
    if (raw === undefined || raw === null) continue;

    const target = map[stName];
    const spec = target === undefined ? undefined : specs.get(target);
    if (target === undefined || spec === undefined) {
      ignored.push(`${stName}: chuẩn "${provider.label}" không có tham số tương ứng.`);
      continue;
    }

    // `seed: -1` của SillyTavern nghĩa là "không đặt seed", không phải seed số -1.
    if (stName === 'seed' && raw === -1) {
      ignored.push('seed: -1 nghĩa là ngẫu nhiên — không đặt seed.');
      continue;
    }

    if (spec.kind === 'enum') {
      const text =
        target === 'thinkingLevel' && typeof raw === 'string'
          ? THINKING_LEVEL[raw.toLowerCase()]
          : String(raw);
      if (text === undefined || !(spec.options ?? []).includes(text)) {
        ignored.push(`${stName}: "${String(raw)}" không nằm trong ${(spec.options ?? []).join('/')}.`);
        continue;
      }
      // Tham số optional chỉ áp khi preset nói khác mặc định — xem ghi chú dưới.
      if (spec.optional === true && text === spec.default) {
        ignored.push(`${stName}: bằng mặc định, không bật tham số ngoài chuẩn.`);
        continue;
      }
      params[target] = text;
      applied.push(`${stName} → ${target} = ${text}`);
      continue;
    }

    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      ignored.push(`${stName}: "${String(raw)}" không phải số.`);
      continue;
    }

    /*
      Tham số NGOÀI CHUẨN (`min_p`, `top_a`, `repetition_penalty`, `n`) chỉ áp
      khi preset đặt nó KHÁC giá trị trung tính. SillyTavern luôn ghi đủ cả bốn
      kể cả khi tác giả preset không đụng tới chúng, và gửi `min_p: 0` lên một
      proxy không hiểu nó là ăn ngay 400 — hỏng một kết nối vốn đang chạy tốt,
      để đổi lấy một tham số không có tác dụng gì.
    */
    if (spec.optional === true && raw === spec.default) {
      ignored.push(`${stName}: bằng mặc định, không bật tham số ngoài chuẩn.`);
      continue;
    }

    const value = clampToSpec(spec, raw, stName, ignored);
    params[target] = value;
    applied.push(`${stName} → ${target} = ${value}`);
  }

  // --- Hai con số token, và đây là chỗ chúng KHÔNG được lẫn vào nhau --------
  const tokens: PresetTuning['tokens'] = {};
  const context = source.openai_max_context;
  const output = source.openai_max_tokens;

  if (typeof context === 'number' && context > 0) {
    tokens.input = Math.round(context);
    applied.push(`openai_max_context → cửa sổ ngữ cảnh (token VÀO) = ${tokens.input}`);
  }
  if (typeof output === 'number' && output > 0) {
    tokens.output = Math.round(output);
    applied.push(`openai_max_tokens → trần sinh ra (token RA) = ${tokens.output}`);
  }
  if (tokens.input !== undefined && tokens.output !== undefined && tokens.output >= tokens.input) {
    // Trần đầu ra bị trừ thẳng khỏi ngân sách prompt: bằng hoặc lớn hơn cửa sổ
    // nghĩa là prompt còn 0 token và mọi lượt đều rơi vào `overflow`.
    tokens.output = Math.max(256, Math.floor(tokens.input / 2));
    ignored.push(
      `openai_max_tokens (${output}) ≥ openai_max_context (${context}); đã hạ trần đầu ra xuống ${tokens.output}.`,
    );
  }

  const stream = typeof source.stream_openai === 'boolean' ? source.stream_openai : undefined;
  if (stream !== undefined) {
    applied.push(`stream_openai → streaming ${stream ? 'BẬT' : 'TẮT'}`);
  }

  return { params, stream, tokens, applied, ignored };
}
