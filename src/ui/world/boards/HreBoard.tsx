/**
 * BẢNG ĐẾ QUỐC — cải cách đế chế (mục 2.5, mục 8).
 *
 * Hình dạng riêng: **MỘT THANH KÉO CO.** Quyền uy đế chế và tự do chư hầu là hai
 * đầu của cùng một thanh, và mọi dự luật chỉ làm một việc: kéo nó sang trái. Dưới
 * đó là bảy ghế tuyển hầu — bảy ô vuông, xanh là thuận, đỏ là chống — vì ở thể
 * loại này câu hỏi duy nhất mỗi kỳ Đế hội là "đủ bốn phiếu chưa".
 */

import type { ReactNode } from 'react';
import {
  dietConfig,
  dietFactionName,
  electors,
  princes,
  reformOf,
  reformRows,
  type AccessTier,
  type ClarityLevel,
  type HreBoard as Board,
} from '@/systems/nations';
import { nextReform, tally } from '@/nations/hre';
import { Fog, Line } from '../parts';

export interface HreBoardProps {
  board: Board;
  tier: AccessTier;
  clarity: ClarityLevel;
}

export function HreBoard({ board, tier, clarity }: HreBoardProps): ReactNode {
  const config = dietConfig();
  const pending = board.pendingReformId === '' ? nextReform(board) : reformOf(board.pendingReformId);
  const vote = pending === null ? null : tally(board, pending.id);
  const seats = princes().reduce((sum, prince) => sum + prince.seats, 0);

  return (
    <div className="space-y-3">
      {/* Kéo co: quyền uy đế chế ↔ tự do chư hầu. */}
      <div className="rounded border border-oak/60 p-2">
        <div className="flex items-baseline justify-between text-[10px] uppercase tracking-wide text-vellum/40">
          <span>quyền uy đế chế</span>
          <span>tự do chư hầu</span>
        </div>
        <div className="mt-1 flex h-3 overflow-hidden rounded bg-ink">
          <div className="bg-gold/70" style={{ width: `${String(board.authority)}%` }} />
          <div className="flex-1 bg-rust/50" />
        </div>
        <div className="mt-0.5 flex justify-between text-[11px]">
          <Fog value={board.authority} clarity={clarity} />
          <Fog value={board.freedom} clarity={clarity} />
        </div>
        {board.excommunicated && (
          <p className="mt-1 text-[11px] text-rust">Hoàng đế đang bị vạ — chư hầu được cởi lời thề trung thành.</p>
        )}
        {board.collapseYears > 0 && (
          <p className="mt-1 text-[11px] text-rust">
            Quyền uy dưới ngưỡng sụp năm thứ {String(board.collapseYears)}/{String(config.collapseYears)} — đế quốc đang rã dần.
          </p>
        )}
      </div>

      {/* Bảy ghế tuyển hầu. */}
      <div className="rounded border border-oak/60 p-2">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">
          Tuyển hầu · cần {String(config.vote.electorMajority)}/{String(electors().length)} thuận
        </p>
        <div className="grid grid-cols-7 gap-1">
          {electors().map((elector) => {
            const lean = board.leans[elector.id] ?? elector.lean;
            const yes = lean >= config.vote.leanToVoteAt;
            return (
              <div
                key={elector.id}
                title={`${elector.name} — ${dietFactionName(elector.faction)} · giá: ${elector.price}`}
                className={`h-10 rounded border text-center text-[9px] leading-tight ${
                  yes ? 'border-moss bg-moss/20 text-moss' : 'border-rust/60 bg-rust/10 text-rust'
                }`}
              >
                <span className="block pt-1">{elector.name.split(' ').slice(-1)[0]}</span>
                <span className="block font-mono">{String(Math.round(lean))}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dự luật đang chờ. */}
      <div className="rounded border border-oak/60 p-2">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">
          Đế hội sau {String(board.yearsToDiet)} năm nữa · họp mỗi {String(config.dietEveryYears)} năm
        </p>
        {pending === null ? (
          <p className="text-[11px] text-moss">Sáu cải cách đã thông qua đủ. Đế quốc giờ là một quốc gia.</p>
        ) : (
          <>
            <p className="text-sm text-parchment">{pending.name}</p>
            <p className="text-[11px] text-vellum/50">{pending.summary}</p>
            {vote !== null && (
              <p className="mt-1 font-mono text-[11px] text-vellum/60">
                tuyển hầu {String(vote.electorYes)}/{String(electors().length)} · chư hầu {String(vote.princeYes)}/{String(seats)} ghế
                {vote.passed ? ' · ĐỦ' : ' · CHƯA ĐỦ'}
              </p>
            )}
            {vote !== null && vote.blockers.length > 0 && (
              <p className="mt-0.5 text-[10px] text-rust">chống: {vote.blockers.slice(0, 4).join(', ')}</p>
            )}
          </>
        )}
      </div>

      {/* Cải cách đã thông qua. */}
      <div className="rounded border border-oak/60 p-2">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">Sáu dự luật</p>
        {reformRows().map((reform) => (
          <Line key={reform.id} label={reform.name}>
            <span className={`text-[11px] ${board.passedReformIds.includes(reform.id) ? 'text-moss' : 'text-vellum/40'}`}>
              {board.passedReformIds.includes(reform.id) ? 'đã thông qua' : `+${String(reform.authority)} uy / ${String(reform.freedom)} tự do`}
            </span>
          </Line>
        ))}
      </div>

      {tier === 'choi-that' && (
        <p className="text-[11px] text-vellum/50">
          Công cụ: ban đất, ban tước, tha nợ, hôn nhân, dọa nạt, chia rẽ phe đối lập — và chọn đứng cùng hay chống Giáo hoàng.
        </p>
      )}
    </div>
  );
}
