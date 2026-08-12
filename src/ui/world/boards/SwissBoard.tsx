/**
 * BẢNG LIÊN BANG NÚI — liên bang & lính đánh thuê (mục 2.3, mục 8).
 *
 * Hình dạng riêng: **MỘT BẢNG KIỂM PHIẾU.** Không có chỉ số quốc gia nào ở trên
 * cùng — thứ đầu tiên người chơi thấy là danh sách bang với lá phiếu của từng
 * bang, vì ở đây không ai ra lệnh được cho ai và mọi thứ khác chỉ là hệ quả của
 * việc thuyết phục được bao nhiêu bang.
 *
 * Bảng hợp đồng có một cột mà bảy thế lực kia không có: CHIẾN TRƯỜNG. Hai bang
 * cùng một chiến trường mà khác chủ thuê là dòng chữ đỏ — anh em họ sắp gặp nhau
 * ở hai phía một trận.
 */

import type { ReactNode } from 'react';
import { powerName, type AccessTier, type ClarityLevel, type SwissBoard as Board } from '@/systems/nations';
import { Bar, Fog, Line } from '../parts';

export interface SwissBoardProps {
  board: Board;
  tier: AccessTier;
  clarity: ClarityLevel;
}

export function SwissBoard({ board, tier, clarity }: SwissBoardProps): ReactNode {
  const theatres = new Map<string, Set<string>>();
  for (const contract of board.contracts) {
    const set = theatres.get(contract.theatre) ?? new Set<string>();
    set.add(contract.employer);
    theatres.set(contract.theatre, set);
  }

  return (
    <div className="space-y-3">
      {/* Hội đồng: mọi quyết định lớn cần ĐỒNG THUẬN. */}
      <div className="rounded border border-oak/60 p-2">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">
          Hội đồng liên bang · {String(board.cantons.reduce((sum, canton) => sum + canton.votes, 0))} phiếu · cần ĐỒNG THUẬN
        </p>
        <table className="w-full text-xs">
          <tbody>
            {board.cantons.map((canton) => (
              <tr key={canton.id} className="border-b border-oak/30 last:border-0">
                <td className="py-0.5 text-parchment">{canton.name}</td>
                <td className="py-0.5 text-center font-mono text-gold">{'▮'.repeat(canton.votes)}</td>
                <td className="py-0.5 text-[10px] text-vellum/50">{canton.interest}</td>
                <td className="w-20 py-0.5">
                  <Bar value={canton.mood} tone={canton.mood < 50 ? 'bg-rust' : 'bg-moss'} title={`tâm trạng ${String(Math.round(canton.mood))}`} />
                </td>
                <td className="py-0.5 text-right text-[10px] text-vellum/50">
                  {canton.feudWith === '' ? '' : `thù ${canton.feudWith.replace('bang_', '')}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Đèo: thế mạnh tuyệt đối, và nó chỉ tồn tại trên núi. */}
        <div className="rounded border border-oak/60 p-2">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">Đèo</p>
          {board.passes.map((pass) => (
            <Line key={pass.id} label={pass.name}>
              <span className={`text-[11px] ${pass.held ? 'text-moss' : 'text-rust'}`}>
                {pass.held ? `giữ · ${String(pass.garrison)} người` : 'đã mất'}
              </span>
            </Line>
          ))}
        </div>

        {/* Cái giá thường trực. */}
        <div className="rounded border border-oak/60 p-2">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">Thanh niên</p>
          <Line label="đang ở nước ngoài">
            <Fog value={board.youthsAbroad} clarity={clarity} scale="men" />
          </Line>
          <Line label="đã chết ở nước ngoài">
            <span className="font-mono text-xs text-rust">{String(Math.round(board.youthsDead))}</span>
          </Line>
          <Line label="lần anh em giết nhau">
            <span className="font-mono text-xs text-rust">{String(board.fratricides)}</span>
          </Line>
          <p className="mt-1 text-[10px] italic text-vellum/40">Con số cuối không bao giờ giảm.</p>
        </div>
      </div>

      {/* Hợp đồng, kèm cảnh báo trùng trận. */}
      <div className="rounded border border-oak/60 p-2">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">Hợp đồng đang có</p>
        {board.contracts.length === 0 && <p className="text-[11px] text-vellum/40">Không có hợp đồng nào — và cũng không có tiền nào.</p>}
        {board.contracts.map((contract) => {
          const clash = (theatres.get(contract.theatre)?.size ?? 0) > 1;
          return (
            <div key={contract.id} className={`mb-1 rounded px-1 ${clash ? 'bg-rust/15' : ''}`}>
              <Line label={`${contract.cantonId.replace('bang_', '')} → ${powerName(contract.employer)}`}>
                <span className="text-[11px] text-vellum/60">
                  {String(contract.men)} người · {contract.theatre} · còn {String(contract.yearsLeft)} năm
                </span>
              </Line>
              {clash && <p className="text-[10px] text-rust">TRÙNG TRẬN: một bang khác đã nhận hợp đồng của phía bên kia.</p>}
            </div>
          );
        })}
      </div>

      {/* Kết nạp bang mới đổi cán cân bỏ phiếu. */}
      {board.admitCandidates.length > 0 && (
        <div className="rounded border border-oak/60 p-2">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">Xin vào liên bang</p>
          {board.admitCandidates.map((candidate) => (
            <Line key={candidate.id} label={candidate.name}>
              <span className="text-[11px] text-vellum/60">
                +{String(candidate.votes)} phiếu · {candidate.interest}
              </span>
            </Line>
          ))}
          <p className="mt-1 text-[10px] italic text-vellum/40">Mỗi bang mới đổi cán cân — có thể mất quyền kiểm soát vì chính mình mở rộng.</p>
        </div>
      )}

      {tier === 'choi-that' && (
        <p className="text-[11px] text-vellum/50">Ngồi vào bàn ở đây nghĩa là đi thuyết phục từng bang một. Không có lệnh nào cả.</p>
      )}
    </div>
  );
}
