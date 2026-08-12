import { z } from 'zod';

/**
 * Chân dung được nhúng vào save để không hỏng khi người chơi đổi máy hoặc xóa
 * tệp ảnh gốc. Giới hạn này tính trên chuỗi data URL sau khi ảnh đã được thu nhỏ.
 */
export const MAX_PORTRAIT_DATA_URL_LENGTH = 1_500_000;
export const MAX_PORTRAIT_SOURCE_BYTES = 12 * 1024 * 1024;
export const MAX_PORTRAIT_EDGE_PX = 960;

const PORTRAIT_DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/u;

export const portraitSchema = z
  .string()
  .max(MAX_PORTRAIT_DATA_URL_LENGTH)
  .refine((value) => value === '' || PORTRAIT_DATA_URL.test(value), 'ảnh chân dung phải là JPEG, PNG hoặc WebP được nhúng trong save')
  .default('');

export function isPortraitDataUrl(value: string): boolean {
  return value !== '' && value.length <= MAX_PORTRAIT_DATA_URL_LENGTH && PORTRAIT_DATA_URL.test(value);
}
