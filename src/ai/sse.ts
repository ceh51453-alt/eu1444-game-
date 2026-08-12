/**
 * Server-Sent Events reader.
 *
 * All three providers stream over SSE (Gemini only with `?alt=sse`), so the
 * framing is parsed once here and each adapter only interprets the JSON inside.
 *
 * Handles the parts of the spec that bite in practice: multi-line `data:`
 * fields, `\r\n` line endings, an `event:` name, and a chunk boundary landing
 * in the middle of a line.
 */

export interface SseEvent {
  /** `event:` field, or empty when the stream does not name its events. */
  event: string;
  /** Concatenated `data:` lines, newline-joined. */
  data: string;
}

/** Feed bytes in, get whole events out. Keeps a buffer across chunks. */
export class SseParser {
  #buffer = '';
  #dataLines: string[] = [];
  #event = '';

  /** Push a decoded text chunk; returns every event completed by it. */
  push(chunk: string): SseEvent[] {
    this.#buffer += chunk;
    const events: SseEvent[] = [];

    let newlineAt = this.#buffer.indexOf('\n');
    while (newlineAt !== -1) {
      const rawLine = this.#buffer.slice(0, newlineAt);
      this.#buffer = this.#buffer.slice(newlineAt + 1);
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

      const finished = this.#consumeLine(line);
      if (finished !== null) events.push(finished);

      newlineAt = this.#buffer.indexOf('\n');
    }

    return events;
  }

  /** Flush a final event that arrived without a trailing blank line. */
  finish(): SseEvent[] {
    const events: SseEvent[] = [];
    if (this.#buffer.length > 0) {
      const line = this.#buffer.endsWith('\r') ? this.#buffer.slice(0, -1) : this.#buffer;
      this.#buffer = '';
      const finished = this.#consumeLine(line);
      if (finished !== null) events.push(finished);
    }
    const trailing = this.#flush();
    if (trailing !== null) events.push(trailing);
    return events;
  }

  #consumeLine(line: string): SseEvent | null {
    if (line === '') return this.#flush();
    if (line.startsWith(':')) return null; // comment / heartbeat

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'data') this.#dataLines.push(value);
    else if (field === 'event') this.#event = value;
    return null;
  }

  #flush(): SseEvent | null {
    if (this.#dataLines.length === 0 && this.#event === '') return null;
    const event: SseEvent = { event: this.#event, data: this.#dataLines.join('\n') };
    this.#dataLines = [];
    this.#event = '';
    return event;
  }
}

/** Read a fetch body as SSE events. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of parser.push(decoder.decode(value, { stream: true }))) {
        yield event;
      }
    }
    for (const event of parser.finish()) yield event;
  } finally {
    reader.releaseLock();
  }
}
