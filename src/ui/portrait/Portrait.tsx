import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  MAX_PORTRAIT_DATA_URL_LENGTH,
  MAX_PORTRAIT_EDGE_PX,
  MAX_PORTRAIT_SOURCE_BYTES,
  isPortraitDataUrl,
} from '@/core/portrait';
import { Button } from '@/ui/settings/controls';

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Không đọc được tệp ảnh này.'));
    };
    image.src = url;
  });
}

function drawPortrait(image: HTMLImageElement, edge: number, quality: number): string {
  const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('Trình duyệt không thể xử lý ảnh.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);

  const webp = canvas.toDataURL('image/webp', quality);
  return webp.startsWith('data:image/webp;') ? webp : canvas.toDataURL('image/jpeg', quality);
}

/** Thu nhỏ ảnh trước khi nhúng để autosave và xuất file vẫn nhẹ, ổn định. */
export async function portraitFromFile(file: File): Promise<string> {
  if (!ACCEPTED_TYPES.has(file.type)) throw new Error('Chỉ nhận ảnh JPEG, PNG hoặc WebP.');
  if (file.size > MAX_PORTRAIT_SOURCE_BYTES) throw new Error('Ảnh gốc phải nhỏ hơn 12 MB.');

  const image = await loadImage(file);
  if (image.naturalWidth === 0 || image.naturalHeight === 0) throw new Error('Ảnh không có kích thước hợp lệ.');

  let edge = MAX_PORTRAIT_EDGE_PX;
  let quality = 0.88;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const value = drawPortrait(image, edge, quality);
    if (value.length <= MAX_PORTRAIT_DATA_URL_LENGTH && isPortraitDataUrl(value)) return value;
    edge = Math.max(320, Math.round(edge * 0.8));
    quality = Math.max(0.58, quality - 0.06);
  }
  throw new Error('Ảnh vẫn quá lớn sau khi thu nhỏ. Hãy chọn ảnh đơn giản hơn.');
}

export function PortraitImage({
  value,
  alt,
  className = '',
}: {
  value: string;
  alt: string;
  className?: string;
}): ReactNode {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [value]);

  return (
    <div className={`grid place-items-center overflow-hidden rounded border border-oak-light bg-ink/80 ${className}`}>
      {value !== '' && !failed ? (
        <img src={value} alt={alt} className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span className="px-2 text-center text-[10px] text-vellum/35">Chưa có ảnh</span>
      )}
    </div>
  );
}

export function PortraitPicker({
  value,
  onChange,
  alt,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  alt: string;
  compact?: boolean;
}): ReactNode {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const choose = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    setBusy(true);
    setError('');
    try {
      onChange(await portraitFromFile(file));
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <PortraitImage
        value={value}
        alt={alt}
        className={compact ? 'aspect-[4/5] w-24' : 'aspect-[4/5] w-36'}
      />
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => { void choose(event); }}
      />
      <div className="flex flex-wrap gap-1.5">
        <Button disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Đang xử lý…' : value === '' ? 'Chọn ảnh' : 'Đổi ảnh'}
        </Button>
        {value !== '' && <Button variant="danger" disabled={busy} onClick={() => onChange('')}>Xóa ảnh</Button>}
      </div>
      {!compact && <p className="text-xs text-vellum/40">JPEG, PNG hoặc WebP · ảnh tự thu nhỏ và được lưu cùng ván chơi</p>}
      {error !== '' && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
