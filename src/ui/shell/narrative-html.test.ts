import { describe, expect, it } from 'vitest';
import { looksLikeMarkup, sandboxDocument, sanitizeMarkup, splitNarrative } from './narrative-html';

describe('cắt đoạn văn sau regex hiển thị', () => {
  it('chữ thuần vẫn là chữ thuần', () => {
    expect(splitNarrative('Ngài bước vào đại sảnh.')).toEqual([
      { kind: 'text', text: 'Ngài bước vào đại sảnh.' },
    ]);
  });

  it('tách khối ```html ra khỏi phần văn xuôi quanh nó', () => {
    const text = [
      'Ta sẽ bệt lại trên chiếu.',
      '```html',
      '<!DOCTYPE html>',
      '<div class="ink-header">Sân tập kiếm</div>',
      '```',
      'Sương mù chưa tan.',
    ].join('\n');

    expect(splitNarrative(text).map((segment) => segment.kind)).toEqual(['text', 'document', 'text']);
    const doc = splitNarrative(text)[1];
    expect(doc?.kind === 'document' && doc.html).toContain('ink-header');
  });

  it('khối ```html chưa đóng vẫn vào iframe thay vì đổ mã ra màn hình', () => {
    const segments = splitNarrative('Mở đầu\n```html\n<div>khung cụt</div>');
    expect(segments.map((segment) => segment.kind)).toEqual(['text', 'document']);
  });

  it('HTML rời đi đường markup, không đi đường chữ', () => {
    const segments = splitNarrative('<div class="cot-wrapper"><summary>nháp</summary></div>');
    expect(segments).toHaveLength(1);
    expect(segments[0]?.kind).toBe('markup');
  });

  it('nhận ra thẻ, và không nhận nhầm dấu bé hơn', () => {
    expect(looksLikeMarkup('<div>x</div>')).toBe(true);
    expect(looksLikeMarkup('quân số 3 < 5 nên rút')).toBe(false);
  });
});

describe('lọc HTML trước khi vẽ vào DOM của game', () => {
  it('giữ khung trang trí và thuộc tính bình thường', () => {
    const html = '<details class="cot" data-theme="dark"><summary>Chuỗi tư duy</summary><p>nháp</p></details>';
    expect(sanitizeMarkup(html)).toBe(html);
  });

  it('bỏ script cùng toàn bộ ruột của nó', () => {
    const out = sanitizeMarkup('<div>trước<script>fetch("/x")</script>sau</div>');
    expect(out).toBe('<div>trướcsau</div>');
    expect(out).not.toContain('fetch');
  });

  it('bỏ trình xử lý sự kiện và URL chạy được mã', () => {
    const out = sanitizeMarkup('<a href="javascript:alert(1)" onclick="alert(2)" title="đi">x</a>');
    expect(out).toBe('<a title="đi">x</a>');
  });

  it('giữ nguyên ruột của style, kể cả bộ chọn con', () => {
    const out = sanitizeMarkup('<style>.cot-wrapper > summary { color: #fff; }</style>');
    expect(out).toBe('<style>.cot-wrapper > summary { color: #fff; }</style>');
  });

  it('cởi vỏ tài liệu nhưng giữ ruột', () => {
    const out = sanitizeMarkup('<!DOCTYPE html><html><head><title>bỏ</title></head><body><p>giữ</p></body></html>');
    expect(out).toBe('<p>giữ</p>');
  });

  it('không cắt nhầm ở dấu lớn hơn nằm trong giá trị thuộc tính', () => {
    const out = sanitizeMarkup(`<div style="content:'>'" class="a">x</div>`);
    expect(out).toContain('class="a"');
    expect(out).toContain('>x</div>');
  });

  it('escape dấu bé hơn trong văn xuôi nhưng không đụng vào thực thể', () => {
    expect(sanitizeMarkup('<p>3 < 5 &nbsp; &amp; xong</p>')).toBe('<p>3 &lt; 5 &nbsp; &amp; xong</p>');
  });

  it('bỏ iframe do nội dung mang vào — khung sandbox là do engine dựng', () => {
    expect(sanitizeMarkup('<div><iframe src="http://x"></iframe>ở lại</div>')).toBe('<div>ở lại</div>');
  });

  it('bỏ thẻ lạ nhưng giữ chữ bên trong', () => {
    expect(sanitizeMarkup('<marquee-x>chữ</marquee-x>')).toBe('chữ');
  });

  it('giữ thẻ nguồn reasoning để script Tavern Helper thay bằng panel', () => {
    expect(sanitizeMarkup('<thinking>nháp</thinking><p>chính văn</p>')).toBe(
      '<thinking>nháp</thinking><p>chính văn</p>',
    );
  });
});

describe('bọc khối ```html vào iframe', () => {
  it('mảnh rời được gói thành một tài liệu đủ', () => {
    const out = sandboxDocument('<div>khung</div>', 'khung-1');
    expect(out).toContain('<!doctype html>');
    expect(out).toContain('<div>khung</div>');
    expect(out).toContain('khung-1');
  });

  it('tài liệu đã đủ thì chỉ chèn thêm mẩu đo chiều cao', () => {
    const out = sandboxDocument('<!DOCTYPE html><html><body><p>x</p></body></html>', 'khung-2');
    expect(out.match(/<html/gi)).toHaveLength(1);
    expect(out).toContain('khung-2');
    expect(out.indexOf('khung-2')).toBeLessThan(out.indexOf('</body>'));
  });

  it('tài liệu thiếu thẻ đóng vẫn nhận được mẩu đo', () => {
    expect(sandboxDocument('<html><body><p>x</p>', 'khung-3')).toContain('khung-3');
  });
});
