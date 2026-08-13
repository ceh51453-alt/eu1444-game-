/**
 * Embedding cục bộ cho lorebook.
 *
 * Không gọi mạng và không cần model: văn bản được chuẩn hóa thành unigram +
 * bigram, băm vào một vector cố định rồi so cosine. Nó không thay embedding
 * ngữ nghĩa của model lớn, nhưng cho phép truy hồi mềm các cách nói gần nhau
 * mà danh sách từ khóa không thể liệt kê hết.
 */

const DIMENSIONS = 384;
const STOP = new Set([
  'va', 'la', 'cua', 'cho', 'mot', 'nhung', 'cac', 'trong', 'voi', 'tu', 'den',
  'khi', 'nay', 'do', 'duoc', 'bi', 'co', 'khong', 've', 'tai', 'theo', 'nhu',
]);

function normalize(text: string): string[] {
  return text
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP.has(token));
}

function hash(token: string): number {
  let value = 2166136261;
  for (let i = 0; i < token.length; i++) {
    value ^= token.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function embedLoreText(text: string): Float32Array {
  const tokens = normalize(text);
  const vector = new Float32Array(DIMENSIONS);
  const features = [...tokens, ...tokens.slice(1).map((token, index) => `${tokens[index] ?? ''}_${token}`)];
  for (const feature of features) {
    const code = hash(feature);
    const sign = (code & 1) === 0 ? 1 : -1;
    const index = (code >>> 1) % DIMENSIONS;
    vector[index] = (vector[index] ?? 0) + sign;
  }
  let norm = 0;
  for (const value of vector) norm += value * value;
  if (norm === 0) return vector;
  const scale = 1 / Math.sqrt(norm);
  for (let i = 0; i < vector.length; i++) vector[i] = (vector[i] ?? 0) * scale;
  return vector;
}

export function loreEmbeddingSimilarity(left: string, right: string): number {
  const a = embedLoreText(left);
  const b = embedLoreText(right);
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return Math.max(0, Math.min(1, dot));
}
