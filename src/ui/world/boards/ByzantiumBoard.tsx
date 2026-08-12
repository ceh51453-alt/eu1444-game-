/**
 * BẢNG ĐÔNG LA MÃ — nội chiến & cầu viện (mục 2.2, mục 8).
 *
 * Hình dạng riêng của bảng này: **MỘT ĐƯỜNG ĐI XUỐNG.** Trên cùng là bản đồ lãnh
 * thổ theo từng thập kỷ vẽ thành bậc thang tụt dần, và mọi thứ khác treo dưới nó.
 * Bảy bảng kia đo trạng thái hiện thời; bảng này đo TỐC ĐỘ MẤT.
 *
 * Cán cân hợp nhất giáo hội là một thanh có HAI ĐẦU CÙNG XẤU: kéo hết sang phải
 * thì có viện binh và dân gọi mình là kẻ phản đạo, để nguyên bên trái thì không
 * ai tới cứu. Không có vùng xanh ở giữa, vì mục 2.2b nói không có đáp án đúng.
 */

import type { ReactNode } from 'react';
import { powerName, type AccessTier, type ByzantineBoard as Board, type ClarityLevel } from '@/systems/nations';
import { Bar, Fog, Line } from '../parts';

export interface ByzantiumBoardProps {
  board: Board;
  tier: AccessTier;
  clarity: ClarityLevel;
  land: number;
}

export function ByzantiumBoard({ board, tier, clarity, land }: ByzantiumBoardProps): ReactNode {
  const decades = board.landByDecade.length > 0 ? board.landByDecade : [{ year: 0, land }];
  const peak = Math.max(...decades.map((row) => row.land), land, 1);

  return (
    <div className="space-y-3">
      {/* Bậc thang tụt dần — đường đi xuống của mục 2.2. */}
      <div className="rounded border border-oak/60 p-2">
        <p className="mb-2 text-[10px] uppercase tracking-wide text-vellum/40">
          Lãnh thổ theo thập kỷ · sống sót {String(board.survivalYears)} năm
        </p>
        <div className="flex h-16 items-end gap-1">
          {decades.map((row) => (
            <div key={row.year} className="flex flex-1 flex-col items-center justify-end">
              <div className="w-full bg-rust/60" style={{ height: `${String((row.land / peak) * 100)}%` }} />
              <span className="mt-0.5 text-[9px] text-vellum/40">{String(row.year)}</span>
            </div>
          ))}
          <div className="flex flex-1 flex-col items-center justify-end">
            <div className="w-full bg-gold/70" style={{ height: `${String((land / peak) * 100)}%` }} />
            <span className="mt-0.5 text-[9px] text-gold">nay</span>
          </div>
        </div>
      </div>

      {/* Các nhánh hoàng tộc và yêu sách. */}
      <div className="rounded border border-oak/60 p-2">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">
          {board.civilWar.active ? `NỘI CHIẾN — năm thứ ${String(board.civilWar.years)}` : 'Các nhánh hoàng tộc'}
        </p>
        {board.claimants.map((claimant) => (
          <div key={claimant.id} className="mb-1">
            <Line label={claimant.name}>
              <span className="text-[11px] text-vellum/60">
                {claimant.backer === '' ? `${String(Math.round(claimant.age))} tuổi` : `hậu thuẫn: ${powerName(claimant.backer)}`}
              </span>
            </Line>
            <Bar value={claimant.strength} tone={claimant.id === board.civilWar.challengerId ? 'bg-rust' : 'bg-oak-light'} />
          </div>
        ))}
        {board.civilWar.hiredPower !== '' && (
          <p className="mt-1 text-[11px] text-rust">
            Đã thuê quân của {powerName(board.civilWar.hiredPower)} — và bên được thuê sẽ ở lại.
          </p>
        )}
      </div>

      {/* Cán cân hợp nhất giáo hội: hai đầu cùng xấu. */}
      <div className="rounded border border-oak/60 p-2">
        <div className="flex items-baseline justify-between text-[10px] uppercase tracking-wide text-vellum/40">
          <span>không viện binh</span>
          <span>hợp nhất giáo hội</span>
          <span>bị gọi là phản đạo</span>
        </div>
        <Bar value={board.unionProgress} tone={board.unionSigned ? 'bg-rust' : 'bg-gold/70'} />
        <div className="mt-1 space-y-0.5">
          <Line label="dân phẫn nộ">
            <Fog value={board.populaceAnger} clarity={clarity} />
          </Line>
          <Line label="đã ký">
            <span className="font-mono text-xs text-parchment">{board.unionSigned ? 'rồi' : 'chưa'}</span>
          </Line>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Eo biển: phần mình còn thu được. */}
        <div className="rounded border border-oak/60 p-2">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">Thu nhập eo biển</p>
          <Line label="tổng">
            <Fog value={board.straitsIncome} clarity={clarity} scale="money" />
          </Line>
          <Line label="thành bang giữ">
            <span className="font-mono text-xs text-rust">{(board.latinShare * 100).toFixed(0)}%</span>
          </Line>
          <Bar value={(1 - board.latinShare) * 100} tone="bg-moss" />
        </div>

        {/* Hội đồng trường sinh: hệ số bảo thủ là HÀM CỦA TUỔI. */}
        <div className="rounded border border-oak/60 p-2">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">Hội đồng trường sinh</p>
          <Line label="tuổi trung bình">
            <span className="font-mono text-xs text-parchment">{String(Math.round(board.councilAvgAge))}</span>
          </Line>
          <Line label="hệ số bảo thủ">
            <Fog value={board.conservatism} clarity={clarity} />
          </Line>
          <Bar value={board.conservatism} tone="bg-oak-light" />
          <p className="mt-1 text-[10px] italic text-vellum/40">"Cách cũ từng hiệu quả."</p>
        </div>
      </div>

      {tier !== 'quan-sat' && (
        <p className="text-[11px] text-vellum/50">
          Mọi lựa chọn cứu vãn đều đẩy nhanh sự sụp đổ. Điều kiện thắng là sống sót lâu hơn dự kiến.
        </p>
      )}
    </div>
  );
}
