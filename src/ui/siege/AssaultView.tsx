/**
 * MÀN HÌNH TỔNG CÔNG — LƯỚI CÓ TẦNG (Phần 11 mục 9).
 *
 * "Lưới có tầng, chuyển góc nhìn giữa các lớp. ĐÁNH DẤU RÕ các chốt thắt cổ chai
 * và thương vong dự kiến."
 *
 * Vế thứ hai mới là vế quan trọng, và nó là lý do component này in ra `frontage`
 * to bằng chữ chứ không giấu trong tooltip: mục 1 nói tổng công là NƯỚC CUỐI
 * CÙNG, và người chơi chỉ hiểu điều đó TRƯỚC KHI bấm nếu họ nhìn thấy con số
 * "mặt tiền 2" nằm giữa lớp mặt tường. Một màn hình chỉ hiện kết quả sau mỗi hiệp
 * sẽ dạy được đúng bài học ấy — nhưng dạy bằng hai nghìn cái xác.
 *
 * Vẽ theo CHIỀU DỌC, từ dưới hào lên tháp chính, vì đó là hướng người ta trèo.
 */

import type { ReactNode } from 'react';
import { assaultLayerOf, type SiegeState } from '@/systems/siege';
import { assaultBreakdown, layerPath } from '@/minigames/siege-attack';

export function AssaultView({ siege, methodId }: { siege: SiegeState; methodId: string }): ReactNode {
  const assault = siege.assault;
  const path = layerPath(siege, methodId);

  return (
    <div className="flex flex-col gap-2">
      {/* Từ trong ra ngoài trên màn hình = từ trên xuống dưới, đúng chiều người trèo. */}
      {[...path].reverse().map((layerId) => {
        const layer = assaultLayerOf(layerId);
        if (layer === null) return null;
        const breakdown = assaultBreakdown(siege, layerId);
        const here = assault?.waves.filter((wave) => !wave.spent && !wave.through && wave.layerId === layerId) ?? [];
        const taken = assault?.taken.includes(layerId) === true;
        const jam = here.length > layer.frontage;

        return (
          <div
            key={layerId}
            className={`rounded border px-3 py-2 ${
              here.length > 0 ? 'border-brass bg-oak' : taken ? 'border-oak-light/40 bg-oak/30' : 'border-oak-light bg-oak/60'
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[0.72rem] font-semibold text-parchment">{layer.name}</span>
              <span className="flex items-baseline gap-3 text-[0.6rem]">
                <span className={jam ? 'text-[#b8332b]' : 'text-[#d9a441]'}>
                  chốt thắt cổ chai: {layer.frontage} đợt cùng lúc{jam ? ' — ĐANG NÊM' : ''}
                </span>
                <span className="text-parchment/45">bậc {breakdown.band}</span>
                <span className="text-parchment/45">phơi mình ×{layer.exposure}</span>
              </span>
            </div>
            <p className="mt-0.5 text-[0.58rem] text-parchment/40">{layer.note}</p>

            {here.length > 0 && (
              <ul className="mt-1 flex flex-wrap gap-1">
                {here.map((wave) => (
                  <li
                    key={wave.id}
                    className={`rounded border px-1.5 py-0.5 font-mono text-[0.6rem] ${
                      wave.forlorn ? 'border-[#d9a441] text-[#d9a441]' : 'border-oak-light text-parchment/80'
                    }`}
                    title={`${wave.name}: mất ${String(wave.losses)} người`}
                  >
                    {wave.name} · {wave.men}
                    {wave.playerLed ? ' · ngài' : ''}
                  </li>
                ))}
              </ul>
            )}

            {breakdown.lines.length > 1 && (
              <ul className="mt-1 flex flex-col gap-0.5 border-t border-oak-light/50 pt-1">
                {breakdown.lines.map((line, index) => (
                  <li key={index} className="flex justify-between gap-2 text-[0.56rem] text-parchment/45">
                    <span className="truncate">{line.label}</span>
                    <span className="shrink-0 font-mono">{line.value}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {assault !== null && (
        <div className="flex flex-wrap gap-3 rounded border border-oak-light bg-oak px-3 py-2 text-[0.65rem]">
          <span className="text-parchment/55">
            Hiệp <span className="font-mono text-parchment">{assault.round}</span>
          </span>
          <span className="text-parchment/55">
            Bên tấn công chết <span className="font-mono text-[#b8332b]">{assault.attackerLosses}</span>
          </span>
          <span className="text-parchment/55">
            Bên thủ chết <span className="font-mono text-parchment">{assault.defenderLosses}</span>
          </span>
          <span className="text-parchment/55">
            Còn ngoài hào <span className="font-mono text-parchment">{assault.reserve}</span>
          </span>
        </div>
      )}

      <ol className="flex flex-col gap-0.5">
        {(assault?.log ?? []).slice(-12).map((line, index) => (
          <li key={index} className="text-[0.62rem] leading-snug text-parchment/65">
            {line}
          </li>
        ))}
      </ol>
    </div>
  );
}
