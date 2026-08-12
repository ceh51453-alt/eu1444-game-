/**
 * `narrativeHint` — hai dòng mệnh lệnh cuối khối 11 (Phần 5 mục 10).
 *
 * Mục 10 nói rõ: engine sinh ra chúng, AI KHÔNG được sửa. Đây là chỗ R1 được
 * phát biểu thành câu chữ mà model thật sự đọc — bảng số ở trên nói kết quả là
 * gì, còn hai dòng này nói model không được làm gì với nó.
 *
 * Giọng phải là MỆNH LỆNH và phải nêu đúng cái cấm. "Hãy tôn trọng kết quả" là
 * một lời khuyên, model sẽ thương lượng với nó; "KHÔNG được để ông ta từ chối"
 * thì không có gì để thương lượng.
 */

import type { CheckConsequence, CheckSystem, CheckTier } from '@/core/turn';

/** Tên hệ, hiện trên UI theo mục 2 — người chơi luôn phải thấy hệ nào đang chạy. */
export const SYSTEM_LABELS: Readonly<Record<CheckSystem, string>> = {
  d100: 'd100 tung-dưới',
  d20: 'd20 + chỉ số vs DC',
  '3d6': '3d6 tung-dưới',
  pool: 'dice pool d6',
};

/** Nhãn của cột hệ quả, dùng chung cho khối 11 và panel chi tiết. */
export const CONSEQUENCE_LABELS: Readonly<Record<CheckConsequence['kind'], string>> = {
  cost: 'Cái giá engine đã định',
  boon: 'Lợi ích engine đã định',
  escalation: 'Biến cố engine đã định',
};

/**
 * Sinh hai dòng mệnh lệnh cho một cấp kết quả.
 *
 * Dòng cấm-chết ở `critFail` không phải cho đẹp: mục 5 ràng buộc critFail chỉ
 * được LEO THANG tình huống, không được giết ngay hay làm mất trắng thành trì,
 * vì game không có reroll và người chơi phải luôn thấy mình còn cửa xoay xở.
 * Ràng buộc đó chỉ có hiệu lực nếu nó nằm trong prompt.
 */
export function narrativeHint(tier: CheckTier, consequence: CheckConsequence | null = null): string {
  const lines: string[] = ['Hãy viết cảnh này theo đúng kết quả trên.'];

  switch (tier) {
    case 'critSuccess':
      lines.push('KHÔNG được hạ thấp mức thành công, KHÔNG được thêm trắc trở nào.');
      if (consequence !== null) lines.push('KHÔNG được bỏ qua lợi ích engine đã định.');
      break;
    case 'success':
      lines.push('KHÔNG được để hành động thất bại, KHÔNG được thêm cái giá nào.');
      break;
    case 'costlySuccess':
      lines.push('KHÔNG được để hành động thất bại.');
      lines.push('KHÔNG được bỏ qua cái giá, và KHÔNG được đổi nó thành cái giá khác.');
      break;
    case 'fail':
      lines.push('KHÔNG được để hành động thành công.');
      lines.push('KHÔNG được gỡ lại bằng một pha may mắn mà engine chưa tung.');
      break;
    case 'critFail':
      lines.push('KHÔNG được để hành động thành công, và KHÔNG được bỏ qua biến cố engine đã định.');
      lines.push(
        'Nhưng KHÔNG được để nhân vật mất mạng hay mất trắng thành trì ngay trong cảnh này — chỉ được đẩy tình huống xấu thêm.',
      );
      break;
  }

  return lines.join('\n');
}
