/**
 * THẺ MỜI TRẬN ĐÁNH — chỗ truyện giao lại quyền quyết cho người chơi.
 *
 * Hiện ngay dưới đoạn văn vừa đọc xong, không phải một hộp thoại chặn màn hình:
 * người kể chuyện vừa nói có kẻ rút kiếm, và bước tiếp theo là của người chơi
 * chứ không phải của engine.
 *
 * BA THỨ PHẢI CÓ TRÊN THẺ, và cả ba đều là điều kiện để lựa chọn có nghĩa:
 *   1. đánh với ai và mạnh cỡ nào — con số thật, đúng thứ engine sắp dựng
 *   2. "Vào trận" mở minigame của Phần 9/10/11
 *   3. "Bỏ qua" KHÔNG phải là hủy trận: engine đánh thay và ghi hệ quả thật.
 *      Câu ấy in ngay trên thẻ, vì một người bấm "Bỏ qua" mà tưởng mình vừa
 *      thoát khỏi trận đánh sẽ nghĩ game hỏng khi thấy mình gãy tay.
 */

import type { ReactNode } from 'react';
import { offerTag, type EncounterOffer } from '@/systems/encounter';
import { Button } from '@/ui/settings/controls';

export interface EncounterCardProps {
  offer: EncounterOffer;
  onPlay: () => void;
  onSkip: () => void;
  /** Chặn hai nút trong lúc engine đang đánh thay hoặc lượt đang chạy. */
  disabled?: boolean;
}

export function EncounterCard({ offer, onPlay, onSkip, disabled = false }: EncounterCardProps): ReactNode {
  return (
    <section className="rounded border border-brass/70 bg-brass/5 px-4 py-3">
      <p className="text-[0.65rem] tracking-[0.2em] text-brass uppercase">{offerTag(offer)}</p>
      <h3 className="mt-1 text-sm font-semibold text-parchment">{offer.title}</h3>
      <p className="mt-1 text-sm text-parchment/80">{offer.brief}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={onPlay} disabled={disabled}>
          Vào trận
        </Button>
        <Button onClick={onSkip} disabled={disabled}>
          Bỏ qua — engine đánh thay
        </Button>
      </div>

      <p className="mt-2 text-xs text-vellum/50">
        Bỏ qua <b className="text-vellum/70">không</b> phải là trận này không xảy ra: engine cầm cả hai bên đánh
        trọn trận rồi ghi đủ hệ quả — thắng thua, thương tích, điểm thực hành.
      </p>
    </section>
  );
}
