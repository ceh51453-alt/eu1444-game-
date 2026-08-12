/**
 * BẢNG ĐẾ QUỐC ORC — mười tám quân đoàn (mục 2.1, mục 8).
 *
 * Hình dạng riêng của bảng này: **HAI CỘT ĐỐI XỨNG** — Cấm Vệ bên trái, Tỉnh Binh
 * bên phải, và giữa chúng là thanh nghiêng ngân sách. Người chơi nhìn một cái là
 * thấy mình đang thiên vị ai, vì đó đúng là câu hỏi duy nhất của thể loại này.
 *
 * Mỗi quân đoàn hai thanh chồng nhau: UY THẾ (trên) và LÒNG TRUNG (dưới). Đoàn
 * nào có thanh trên dài mà thanh dưới ngắn là đoàn sắp làm binh biến, và người
 * chơi đọc được điều đó mà không cần một con số nào.
 */

import type { ReactNode } from 'react';
import { corpsRowOf, techBranchOf, type AccessTier, type ClarityLevel, type OttomanBoard as Board } from '@/systems/nations';
import { mutinyRisk } from '@/nations/ottoman';
import { Bar, Fog, Line } from '../parts';

export interface OttomanBoardProps {
  board: Board;
  tier: AccessTier;
  clarity: ClarityLevel;
  arrears: number;
}

function CorpsRow({ id, board, clarity }: { id: string; board: Board; clarity: ClarityLevel }): ReactNode {
  const state = board.corps.find((corps) => corps.id === id);
  const row = corpsRowOf(id);
  if (state === undefined || row === null) return null;
  const risk = mutinyRisk(state, board.arrearYears);

  return (
    <div className={`rounded border px-2 py-1 ${state.mutinying ? 'border-rust bg-rust/10' : 'border-oak/60'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs text-parchment" title={row.specialty.join(' · ')}>
          {String(row.number)}. {row.name}
        </span>
        <Fog value={state.men} clarity={clarity} scale="men" />
      </div>
      <div className="mt-1 space-y-0.5">
        <Bar value={state.prestige} tone="bg-gold/70" title={`uy thế ${String(Math.round(state.prestige))}`} />
        <Bar
          value={state.loyalty}
          tone={state.loyalty < 40 ? 'bg-rust' : 'bg-moss'}
          title={`lòng trung ${String(Math.round(state.loyalty))}`}
        />
      </div>
      {risk > 0 && clarity === 'biet-ro' && (
        <p className="mt-0.5 text-[10px] text-rust">nguy cơ binh biến {String(risk)}%</p>
      )}
    </div>
  );
}

export function OttomanBoard({ board, tier, clarity, arrears }: OttomanBoardProps): ReactNode {
  const guard = board.corps.filter((corps) => corpsRowOf(corps.id)?.group === 'cam-ve');
  const provincial = board.corps.filter((corps) => corpsRowOf(corps.id)?.group === 'tinh-binh');
  const special = board.corps.filter((corps) => corpsRowOf(corps.id)?.group === 'chuyen-mon');

  return (
    <div className="space-y-3">
      {/* Thanh nghiêng: hai phe đối lập cấu trúc, và không có vị trí trung lập miễn phí. */}
      <div>
        <div className="flex items-baseline justify-between text-[11px] uppercase tracking-wide text-vellum/50">
          <span>Cấm vệ</span>
          <span>ngân sách quân sự {(board.militaryBudget * 100).toFixed(0)}%</span>
          <span>Tỉnh binh</span>
        </div>
        <div className="relative mt-1 h-2 rounded bg-ink">
          <div
            className="absolute top-0 h-2 w-1 rounded bg-gold"
            style={{ left: `${String(50 + board.guardTilt / 2)}%` }}
            title={`nghiêng ${String(board.guardTilt)}`}
          />
        </div>
        {arrears > 0 && (
          <p className="mt-1 text-[11px] text-rust">Chậm lương năm thứ {String(arrears)} — kiểm định binh biến chạy mỗi năm.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          {guard.map((corps) => (
            <CorpsRow key={corps.id} id={corps.id} board={board} clarity={clarity} />
          ))}
        </div>
        <div className="space-y-1">
          {provincial.map((corps) => (
            <CorpsRow key={corps.id} id={corps.id} board={board} clarity={clarity} />
          ))}
          <div className="mt-2 border-t border-oak/40 pt-2 text-[10px] uppercase tracking-wide text-vellum/40">Chuyên môn</div>
          {special.map((corps) => (
            <CorpsRow key={corps.id} id={corps.id} board={board} clarity={clarity} />
          ))}
        </div>
      </div>

      {/* Cây kỹ thuật — thế lực DUY NHẤT có. */}
      <div className="rounded border border-oak/60 p-2">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">Cây kỹ thuật</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {board.tech.map((branch) => {
            const meta = techBranchOf(branch.branchId);
            return (
              <Line key={branch.branchId} label={meta?.name ?? branch.branchId}>
                <span className="font-mono text-xs text-parchment">
                  {'●'.repeat(branch.level)}
                  {'○'.repeat(Math.max(0, (meta?.levels ?? 0) - branch.level))}
                </span>
              </Line>
            );
          })}
        </div>
      </div>

      {/* Bản đồ vùng chiêu mộ và mức oán hận từng vùng. */}
      <div className="rounded border border-oak/60 p-2">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">
          Chiêu mộ dị tộc · chính sách tôn giáo: {board.religiousPolicy === 'khoan-dung' ? 'khoan dung' : 'ép cải đạo'}
        </p>
        {board.devshirme.map((region) => (
          <div key={region.regionId} className="mb-1">
            <Line label={region.regionId}>
              <span className={`text-[11px] ${region.revolted ? 'text-rust' : 'text-vellum/60'}`}>
                {region.revolted ? 'đang nổi dậy' : `${String(region.intakeYears)} đợt`}
              </span>
            </Line>
            <Bar value={region.resentment} tone={region.resentment > 60 ? 'bg-rust' : 'bg-oak-light'} />
          </div>
        ))}
        <p className="mt-1 text-[10px] italic text-vellum/40">
          Cấm vệ phần lớn không phải Orc — đó là điểm của cơ chế này, không phải một lỗi trong bảng.
        </p>
      </div>

      {tier === 'choi-that' && (
        <p className="text-[11px] text-vellum/50">
          Ngồi vào bàn: chia lại ngân sách, chọn vùng lấy người, đặt ưu tiên nghiên cứu, đổi chính sách tôn giáo.
        </p>
      )}
    </div>
  );
}
