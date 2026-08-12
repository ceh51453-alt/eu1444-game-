/**
 * BẢNG GIÁO TRIỀU — mật nghị & quyền lực thiêng (mục 2.7, mục 8).
 *
 * Hình dạng riêng: **MỘT SƠ ĐỒ PHE.** Hồng y đoàn xếp thành các khối theo phe, độ
 * rộng mỗi khối là sức nặng ở mật nghị. Người chơi không đọc chỉ số ở đây — người
 * chơi đếm phiếu, và đếm xem phe mình có đủ khi ngôi khuyết không.
 *
 * Bên dưới là thứ không bảng nào khác có: DANH SÁCH VŨ KHÍ, và mỗi vũ khí ghi rõ
 * giá bằng uy tín. Đó là toàn bộ tấn kịch của thể loại này — mọi thứ Giáo hoàng
 * làm được đều tiêu vào cùng một cái kho, và cái kho ấy cạn thì lời nói hết thiêng.
 */

import type { ReactNode } from 'react';
import { powerName, type AccessTier, type ClarityLevel, type PapacyBoard as Board } from '@/systems/nations';
import { conclave } from '@/nations/papacy';
import { Bar, Fog, Line } from '../parts';

export interface PapacyBoardProps {
  board: Board;
  tier: AccessTier;
  clarity: ClarityLevel;
}

const FACTION_TONE: Readonly<Record<string, string>> = {
  'phe_la-ma': 'bg-gold/60',
  'phe_frank': 'bg-rust/60',
  'phe_de-quoc': 'bg-oak-light',
  'phe_cai-cach': 'bg-moss',
  'phe_thanh-bang': 'bg-vellum/40',
};

export function PapacyBoard({ board, tier, clarity }: PapacyBoardProps): ReactNode {
  const result = conclave(board);
  const total = result.tally.reduce((sum, row) => sum + row.weight, 0) || 1;

  return (
    <div className="space-y-3">
      {/* Uy tín thiêng liêng — cái kho mà mọi vũ khí đều tiêu vào. */}
      <div className="rounded border border-oak/60 p-2">
        <div className="flex items-baseline justify-between text-[10px] uppercase tracking-wide text-vellum/40">
          <span>uy tín thiêng liêng</span>
          {board.antipope.exists && <span className="text-rust">HAI GIÁO HOÀNG từ {String(board.antipope.sinceYear)}</span>}
        </div>
        <Bar value={board.spiritualPrestige} tone={board.spiritualPrestige < 45 ? 'bg-rust' : 'bg-gold/70'} />
        <div className="mt-1 flex justify-between text-[11px]">
          <Fog value={board.spiritualPrestige} clarity={clarity} />
          <span className="text-vellum/50">
            {board.vacancy ? 'NGÔI ĐANG KHUYẾT' : `Giáo hoàng phe ${board.popeFaction.replace('phe_', '')}`}
          </span>
        </div>
        {board.antipope.exists && (
          <p className="mt-1 text-[11px] text-rust">
            Giáo hoàng thứ hai do {powerName(board.antipope.backer)} dựng lên. Cả thế giới phải chọn phe.
          </p>
        )}
      </div>

      {/* Sơ đồ phe trong Hồng y đoàn. */}
      <div className="rounded border border-oak/60 p-2">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">
          Hồng y đoàn · {String(board.cardinals.length)} người {result.deadlock ? '· MẬT NGHỊ SẼ BẾ TẮC' : ''}
        </p>
        <div className="flex h-4 overflow-hidden rounded">
          {result.tally.map((row) => (
            <div
              key={row.faction}
              className={FACTION_TONE[row.faction] ?? 'bg-oak'}
              style={{ width: `${String((row.weight / total) * 100)}%` }}
              title={`${row.faction} — ${String(row.weight)}`}
            />
          ))}
        </div>
        <div className="mt-1 space-y-0.5">
          {result.tally.map((row) => (
            <Line key={row.faction} label={row.faction.replace('phe_', '')}>
              <span className="font-mono text-xs text-parchment">{((row.weight / total) * 100).toFixed(0)}%</span>
            </Line>
          ))}
        </div>
        <p className="mt-1 text-[10px] italic text-vellum/40">
          Phong thêm hồng y phe mình TRƯỚC KHI CHẾT là nước đi quan trọng nhất của cả bảng này.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Ai đang bị vạ. */}
        <div className="rounded border border-oak/60 p-2">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">Vũ khí đang giáng</p>
          {board.excommunicated.length === 0 && board.interdicts.length === 0 && board.crusadeTarget === '' && (
            <p className="text-[11px] text-vellum/40">Không có lệnh nào đang treo.</p>
          )}
          {board.excommunicated.map((id) => (
            <Line key={`vt-${id}`} label={powerName(id)}>
              <span className="text-[11px] text-rust">{board.interdicts.includes(id) ? 'cấm chế cả nước' : 'vạ tuyệt thông'}</span>
            </Line>
          ))}
          {board.crusadeTarget !== '' && (
            <Line label={powerName(board.crusadeTarget)}>
              <span className="text-[11px] text-gold">thập tự chinh</span>
            </Line>
          )}
        </div>

        {/* Dị giáo đang lan ở đâu. */}
        <div className="rounded border border-oak/60 p-2">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">Dị giáo đang lan</p>
          {board.heresyWatch.length === 0 && <p className="text-[11px] text-vellum/40">Chưa vùng nào vượt ngưỡng báo động.</p>}
          {board.heresyWatch.map((watch) => (
            <div key={watch.areaId} className="mb-1">
              <Line label={watch.areaId.replace('nation_', '')}>
                <span className="font-mono text-xs text-rust">{(watch.share * 100).toFixed(0)}%</span>
              </Line>
              <Bar value={watch.share * 100} tone="bg-rust" />
            </div>
          ))}
          {board.indulgenceYears > 0 && (
            <p className="mt-1 text-[10px] text-rust">Đang bán ân xá năm thứ {String(board.indulgenceYears)} — và đó là thứ nuôi dị giáo.</p>
          )}
        </div>
      </div>

      {tier !== 'quan-sat' && (
        <p className="text-[11px] text-vellum/50">
          Mọi tuyên bố của Giáo hoàng đều phát ra toàn thế giới. Không có tuyên bố nào là chuyện nội bộ.
        </p>
      )}
    </div>
  );
}
