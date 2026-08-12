/**
 * BẢNG VƯƠNG QUỐC FRANK — tập quyền (mục 2.6, mục 8).
 *
 * Hình dạng riêng: **MỘT DANH SÁCH THÔN TÍNH.** Mỗi công quốc một dòng, và mỗi
 * dòng có bốn cột: sức mạnh, yêu sách, có người thừa kế không, và đường đang đi.
 * Cột "không có người thừa kế" là cột người chơi giỏi đọc trước mọi cột khác —
 * nó là cửa rẻ nhất trong bốn cửa.
 *
 * Trên cùng KHÔNG phải chỉ số quốc gia mà là NHIỆT KẾ BẤT MÃN, vì ở thể loại này
 * mọi thành công đều nhích cái nhiệt kế ấy lên, và khi nó chạm ngưỡng thì cả nước
 * quý tộc phản trong cùng một mùa.
 */

import type { ReactNode } from 'react';
import type { AccessTier, ClarityLevel, FranceBoard as Board } from '@/systems/nations';
import { paths } from '@/nations/france';
import { Bar, Fog, Line } from '../parts';

export interface FranceBoardProps {
  board: Board;
  tier: AccessTier;
  clarity: ClarityLevel;
}

export function FranceBoard({ board, tier, clarity }: FranceBoardProps): ReactNode {
  const pathName = (id: string): string => paths().find((path) => path.id === id)?.name ?? id;

  return (
    <div className="space-y-3">
      {/* Nhiệt kế bất mãn — cả bảng treo dưới con số này. */}
      <div className="rounded border border-oak/60 p-2">
        <div className="flex items-baseline justify-between text-[10px] uppercase tracking-wide text-vellum/40">
          <span>bất mãn quý tộc</span>
          <span>ngưỡng nổi dậy {String(Math.round(board.revoltThreshold))}</span>
        </div>
        <div className="relative">
          <Bar value={board.discontent} tone={board.discontent > board.revoltThreshold - 15 ? 'bg-rust' : 'bg-oak-light'} />
          <div className="absolute top-0 h-1.5 w-0.5 bg-gold" style={{ left: `${String(board.revoltThreshold)}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[11px]">
          <Fog value={board.discontent} clarity={clarity} />
          <span className="text-vellum/50">
            đất vương quyền {board.crownLand.toFixed(1)} · đất chư hầu {board.vassalLand.toFixed(1)}
          </span>
        </div>
        {board.nobleLeague.formed && (
          <p className="mt-1 text-[11px] text-rust">
            LIÊN MINH QUÝ TỘC ĐANG NỔI DẬY từ năm {String(board.nobleLeague.year)} — {String(board.nobleLeague.members.length)} công quốc
            cùng lúc.
          </p>
        )}
      </div>

      {/* Danh sách thôn tính. */}
      <div className="rounded border border-oak/60 p-2">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">Công quốc</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase text-vellum/35">
              <th className="text-left font-normal">tên</th>
              <th className="w-20 text-left font-normal">sức mạnh</th>
              <th className="w-20 text-left font-normal">yêu sách</th>
              <th className="text-right font-normal">tình trạng</th>
            </tr>
          </thead>
          <tbody>
            {board.duchies.map((duchy) => {
              const suit = board.suits.find((row) => row.duchyId === duchy.id);
              return (
                <tr key={duchy.id} className="border-b border-oak/30 last:border-0">
                  <td className={`py-0.5 ${duchy.absorbed ? 'text-vellum/35 line-through' : 'text-parchment'}`}>{duchy.name}</td>
                  <td className="py-0.5">
                    <Bar value={duchy.strength} tone="bg-oak-light" />
                  </td>
                  <td className="py-0.5">
                    <Bar value={duchy.claimStrength} tone="bg-gold/60" />
                  </td>
                  <td className="py-0.5 text-right text-[11px]">
                    {duchy.absorbed ? (
                      <span className="text-moss">về vương quyền</span>
                    ) : duchy.rebelling ? (
                      <span className="text-rust">đang phản</span>
                    ) : suit !== undefined ? (
                      <span className="text-gold">
                        {pathName(suit.pathId)} · còn {String(suit.yearsLeft)} năm
                      </span>
                    ) : duchy.heirless ? (
                      <span className="text-gold">KHÔNG CÓ NGƯỜI THỪA KẾ</span>
                    ) : (
                      <span className="text-vellum/40">tự trị</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bốn con đường nuốt, kèm giá bằng bất mãn. */}
      <div className="rounded border border-oak/60 p-2">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">Bốn con đường</p>
        {paths().map((path) => (
          <Line key={path.id} label={path.name}>
            <span className="text-[11px] text-vellum/60">
              {String(path.years)} năm · {String(path.cost)} tiền · +{String(path.discontent)} bất mãn
              {path.requiresHeirless ? ' · cần tuyệt tự' : ''}
            </span>
          </Line>
        ))}
      </div>

      {tier === 'choi-that' && (
        <p className="text-[11px] text-vellum/50">
          Mỗi lần nuốt là một mảnh đất và một khoản bất mãn. Bất mãn vượt ngưỡng thì tất cả cùng phản một lúc.
        </p>
      )}
    </div>
  );
}
