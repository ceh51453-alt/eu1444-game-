/**
 * VIẾT NỘI DUNG SỰ KIỆN — Phần 15 mục 8.
 *
 *   importance 4–5   gọi LLM, GỘP NHIỀU SỰ KIỆN VÀO MỘT REQUEST, model rẻ đủ dùng
 *   importance 1–3   dùng mẫu có sẵn với biến thay thế, **KHÔNG gọi LLM**
 *
 * Ranh giới ấy là ranh giới tiền, không phải ranh giới chất lượng. Một tháng của
 * châu lục sinh ra vài chục biến cố nhỏ; gọi LLM cho từng cái là trả tiền để
 * viết hoa mỹ một dòng mà người chơi lướt qua trong nửa giây. Còn một vạ tuyệt
 * thông thì người chơi sẽ đọc kỹ, và sẽ nhớ.
 *
 * MẪU CÓ SẴN KHÔNG PHẢI BẢN NHÁP: `data/news.json → templates.byKind` được viết
 * để đọc lên nghe như biên niên sử thật, và mỗi loại có vài bản để một năm mười
 * hai tháng không ra mười hai câu giống hệt nhau.
 *
 * VÀ VĂN BẢN Ở ĐÂY LUÔN LÀ **SỰ THẬT**. Bóp méo xảy ra ở `news.ts`, lúc tin tới
 * tay người chơi, không phải lúc biến cố sinh ra — nếu trộn hai chỗ thì `world.
 * events` sẽ không còn là nguồn sự thật, và mọi bất biến của mục 9 mất chỗ dựa.
 */

import { z } from 'zod';
import type { Rng } from '@/core/rng';
import type { ConnCfg, LLMProvider } from '@/ai/provider';
import { newsPrompts, templatesFor } from './data';
import { DEFAULT_NAMES, type NameBook } from './news';
import type { WorldEvent } from './types';

/** Từ mức này trở lên thì đáng gọi LLM (mục 8). */
export const LLM_TEXT_FLOOR = 4;

// ---------------------------------------------------------------------------
// Mẫu — không tốn một đồng nào
// ---------------------------------------------------------------------------

function groupThousands(value: number): string {
  return Math.round(value).toLocaleString('vi-VN').replace(/ /g, '.');
}

export function renderTemplate(rng: Rng, event: WorldEvent, names: NameBook = DEFAULT_NAMES): {
  text: string;
  headline: string;
} {
  const template = rng.pick([...templatesFor(event.kind)]);
  const text = template
    .replace(/\{chuThe\}/g, names.actor(event.actorId))
    .replace(/\{mucTieu\}/g, names.actor(event.targetId))
    .replace(/\{noi\}/g, names.place(event.regionId))
    .replace(/\{so\}/g, event.amount > 0 ? groupThousands(event.amount) : '')
    .replace(/\{nam\}/g, String(event.occurredAt.year))
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { text, headline: text.split('.')[0]?.concat('.') ?? text };
}

/**
 * Điền văn bản cho MỌI biến cố bằng mẫu.
 *
 * Chạy TRƯỚC bước gọi LLM, và cố ý điền cả những biến cố mức 4–5: nếu request
 * hỏng, hết ngân sách, hoặc người chơi đã tắt LLM thì biến cố lớn vẫn có chữ để
 * đọc. Một tuyên bố của Giáo hoàng hiện ra dưới dạng một ô trống là kiểu hỏng tệ
 * nhất, vì nó hỏng đúng lúc người chơi đang chú ý nhất.
 */
export function fillFromTemplates(
  rng: Rng,
  events: readonly WorldEvent[],
  names: NameBook = DEFAULT_NAMES,
): WorldEvent[] {
  return events.map((event) => {
    if (event.text !== '') return event;
    const rendered = renderTemplate(rng, event, names);
    return { ...event, text: rendered.text, headline: rendered.headline };
  });
}

// ---------------------------------------------------------------------------
// LLM — chỉ cho mức 4–5, và gộp thành một request
// ---------------------------------------------------------------------------

const replySchema = z.array(
  z.object({
    eventId: z.string().min(1),
    headline: z.string().default(''),
    text: z.string().default(''),
  }),
);

export interface TextDeps {
  provider: LLMProvider;
  cfg: ConnCfg;
  signal?: AbortSignal;
}

export interface TextResult {
  /** eventId → văn bản LLM viết. Thiếu id nào thì biến cố ấy giữ bản mẫu. */
  written: Map<string, { headline: string; text: string }>;
  rejected: string[];
  usage: { in: number; out: number };
  error: string | null;
}

function describeEvent(event: WorldEvent, names: NameBook): string {
  const facts = [
    `- eventId: ${event.id}`,
    `  loại: ${event.kind}`,
    `  mức quan trọng: ${String(event.importance)}/5`,
    `  nơi: ${names.place(event.regionId)}`,
    `  thời gian: tháng ${String(event.occurredAt.month)} năm ${String(event.occurredAt.year)}`,
  ];
  if (event.actorId !== '') facts.push(`  kẻ gây ra: ${names.actor(event.actorId)}`);
  if (event.targetId !== '') facts.push(`  kẻ chịu: ${names.actor(event.targetId)}`);
  // Con số đưa vào NGUYÊN VĂN và prompt cấm đổi nó. Đây là chỗ R1 dễ rò rỉ nhất
  // trong cả Phần 15: một model được kể "chừng hai nghìn người" sẽ rất muốn viết
  // "gần ba nghìn" cho câu văn mạnh hơn.
  if (event.amount > 0) facts.push(`  con số (KHÔNG ĐƯỢC ĐỔI): ${groupThousands(event.amount)}`);
  return facts.join('\n');
}

export function buildTextPrompt(events: readonly WorldEvent[], names: NameBook = DEFAULT_NAMES): string {
  return [
    'BIẾN CỐ CẦN VIẾT LỜI LOAN BÁO:',
    events.map((event) => describeEvent(event, names)).join('\n'),
    '',
    `Trả về đúng ${String(events.length)} phần tử, mỗi phần tử một eventId ở trên.`,
  ].join('\n');
}

/** Biến cố nào đáng gọi LLM. Người gọi cắt tiếp theo trần `eventsPerTextRequest`. */
export function needsLlmText(events: readonly WorldEvent[]): WorldEvent[] {
  return events
    .filter((event) => event.importance >= LLM_TEXT_FLOOR)
    .sort((left, right) => right.importance - left.importance);
}

/**
 * MỘT request cho cả nhóm biến cố lớn.
 *
 * Không ném, cùng lý do với `batch.ts`: bản mẫu đã điền sẵn rồi, nên request
 * hỏng chỉ có nghĩa là tháng ấy các tuyên bố lớn đọc khô hơn một chút (R4).
 */
export async function askEventText(
  deps: TextDeps,
  events: readonly WorldEvent[],
  names: NameBook = DEFAULT_NAMES,
): Promise<TextResult> {
  const empty: TextResult = { written: new Map(), rejected: [], usage: { in: 0, out: 0 }, error: null };
  if (events.length === 0) return empty;

  const prompts = newsPrompts();
  try {
    const response = await deps.provider.stream(
      {
        system: prompts.systemText,
        messages: [{ role: 'user', content: buildTextPrompt(events, names) }],
        maxTokens: prompts.maxTokensText,
        meta: { profile: 'worldtick' },
        ...(deps.signal === undefined ? {} : { signal: deps.signal }),
      },
      deps.cfg,
      () => {},
    );

    const parsed = parseTextReply(response.text, events);
    return { ...parsed, usage: response.usage ?? { in: 0, out: 0 }, error: null };
  } catch (error) {
    return { ...empty, error: `viết văn bản sự kiện hỏng: ${String(error)}` };
  }
}

export function parseTextReply(
  raw: string,
  events: readonly WorldEvent[],
): { written: Map<string, { headline: string; text: string }>; rejected: string[] } {
  const written = new Map<string, { headline: string; text: string }>();
  const rejected: string[] = [];

  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const body = fenced?.[1] ?? raw;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  const slice = start === -1 || end < start ? body.trim() : body.slice(start, end + 1);

  let data: unknown;
  try {
    data = JSON.parse(slice);
  } catch (error) {
    return { written, rejected: [`không đọc được JSON: ${String(error)}`] };
  }

  const parsed = replySchema.safeParse(data);
  if (!parsed.success) {
    return { written, rejected: [`sai schema: ${parsed.error.issues[0]?.message ?? 'không rõ'}`] };
  }

  const known = new Set(events.map((event) => event.id));
  for (const row of parsed.data) {
    if (!known.has(row.eventId)) {
      rejected.push(`"${row.eventId}" không có trong lô này`);
      continue;
    }
    if (row.text.trim() === '') {
      rejected.push(`"${row.eventId}" trả về văn bản rỗng`);
      continue;
    }
    written.set(row.eventId, {
      headline: row.headline.trim() === '' ? (row.text.split('.')[0] ?? row.text) : row.headline.trim(),
      text: row.text.trim(),
    });
  }

  return { written, rejected };
}

/** Áp văn bản LLM lên biến cố. Id không có trong `written` thì giữ bản mẫu. */
export function applyWrittenText(
  events: readonly WorldEvent[],
  written: ReadonlyMap<string, { headline: string; text: string }>,
): WorldEvent[] {
  return events.map((event) => {
    const row = written.get(event.id);
    return row === undefined ? event : { ...event, text: row.text, headline: row.headline };
  });
}
