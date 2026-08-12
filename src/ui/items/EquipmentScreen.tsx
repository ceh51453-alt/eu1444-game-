/**
 * MÀN TRANG BỊ (Phần 16 mục 18).
 *
 * Bảy khung, đúng danh sách của mục 18:
 *   · hình người của Phần 7 làm nền, món giáp vẽ chồng lên đúng vùng nó che
 *   · NÚT GẠT "XEM CHE PHỦ" — màn hình quan trọng nhất của Phần 16
 *   · BA THANH RIÊNG chống chém / đâm / đập, KHÔNG GỘP MỘT SỐ
 *   · ô "Vừa người": món nào không vừa và đang phạt bao nhiêu
 *   · danh sách hư hỏng CỤ THỂ, nút bảo dưỡng, ước tính thời gian và chi phí
 *   · trọng lượng và PHÂN BỔ, cảnh báo khi vượt ngưỡng
 *   · trang "Kho vũ khí" của thành trì: trang bị cho quân đồn trú hàng loạt
 *
 * Kéo thả để mặc: kéo một dòng từ hành lý thả vào hình người. Việc chặn cứng
 * món không vừa nằm ở `equipOps`, không ở đây — UI chỉ hiện lý do.
 *
 * Mở thành lớp phủ toàn màn hình, cùng lý do với màn Kỹ năng của Phần 8: một
 * hình người kèm hai mươi dòng che phủ và bốn bảng bên không nhét vừa cột phải
 * rộng 320px.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { applyPatch } from '@/state/mvu';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import { useGameStore } from '@/state/store';
import { Button } from '@/ui/settings/controls';
import { AVERAGE_BUILD, type Build } from '@/ui/bodymap/silhouette';
import { characterOf } from '@/systems/character';
import {
  carryModeOf,
  equipmentOf,
  itemName,
  maintenancePlan,
  qualityByLevel,
  valueInPeasantYears,
} from '@/systems/items';
import { CoverageBody, type CoverageMode } from './CoverageBody';
import { beltOps, equipOps, maintainOps, packOps, stashOps, unequipOps } from './actions';
import { describeSelected, equipmentView, type EquipmentView, type WornView } from './view';
import { armouryReport } from './armoury';

function useGameState(): GameState {
  return useGameStore((store) => store as unknown as GameState);
}

function commit(ops: readonly PatchOp[]): string {
  if (ops.length === 0) return '';
  const store = useGameStore.getState();
  const snapshot = store.snapshot();
  const applied = applyPatch(snapshot, [...ops], { actor: 'engine' });
  if (!applied.applied || applied.next === null) {
    return `Không ghi được: ${applied.failures.map((entry) => entry.message).join('; ')}`;
  }
  store.commitBatch(applied.next);
  return '';
}

// ---------------------------------------------------------------------------
// Ba thanh riêng biệt (mục 18)
// ---------------------------------------------------------------------------

/**
 * BA THANH, KHÔNG PHẢI MỘT.
 *
 * Đây là chỗ README mục 8.5 sống hay chết trên màn hình: gộp ba con số thành một
 * "chỉ số phòng thủ" thì người chơi không bao giờ hiểu vì sao cây búa giết được
 * mình mà cây kiếm thì không. Nên ba thanh nằm cạnh nhau, cùng thang, và không
 * có một con số tổng nào ở dưới.
 */
function ProtectionBars({ bars }: { bars: { chem: number; dam: number; dap: number } }): ReactNode {
  const rows: { label: string; value: number; color: string }[] = [
    { label: 'Chống chém', value: bars.chem, color: '#7c8ba1' },
    { label: 'Chống đâm', value: bars.dam, color: '#c9a227' },
    { label: 'Chống đập', value: bars.dap, color: '#b8332b' },
  ];
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex justify-between text-xs text-vellum/70">
            <span>{row.label}</span>
            <span className="font-mono">{row.value}</span>
          </div>
          <div className="h-2 w-full rounded bg-oak-light">
            <div
              className="h-2 rounded transition-[width] duration-300"
              style={{ width: `${String(Math.min(100, row.value))}%`, background: row.color }}
            />
          </div>
        </div>
      ))}
      <p className="text-[11px] text-vellum/40 italic">
        Ba con số riêng. Không có một chỉ số phòng thủ tổng — tấm thép chặn lưỡi mà không chặn lực.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Một dòng vật phẩm
// ---------------------------------------------------------------------------

function ItemRow({
  entry,
  action,
  onAction,
  onDragStart,
}: {
  entry: WornView;
  action: string;
  onAction: () => void;
  onDragStart?: () => void;
}): ReactNode {
  const quality = qualityByLevel(entry.item.quality);
  return (
    <li
      draggable={onDragStart !== undefined}
      onDragStart={onDragStart}
      className={`flex items-start justify-between gap-2 border-b border-oak-light/40 px-2 py-1.5 ${
        onDragStart === undefined ? '' : 'cursor-grab'
      } ${entry.refused ? 'opacity-60' : ''}`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm text-vellum">
          {entry.name}
          <span className="ml-1 text-xs text-vellum/40">
            {quality.name} · {entry.kg} kg
          </span>
        </p>
        <p className="text-[11px] text-vellum/50">
          {entry.fitGrade}
          {entry.condition < 100 ? ` · tình trạng ${String(Math.round(entry.condition))}` : ''}
          {entry.damage.length === 0
            ? ''
            : ` · ${entry.damage.map((d) => (d.where === '' ? d.name : `${d.name} (${d.where})`)).join(', ')}`}
        </p>
        {entry.refused && <p className="text-[11px] text-rust">{entry.fitReason}</p>}
      </div>
      <button
        type="button"
        onClick={onAction}
        className="shrink-0 rounded border border-oak-light px-2 py-0.5 text-[11px] text-vellum hover:bg-oak-light"
      >
        {action}
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Màn hình
// ---------------------------------------------------------------------------

export function EquipmentScreen({ onClose }: { onClose: () => void }): ReactNode {
  const state = useGameState();
  const character = characterOf(state);
  const equipment = equipmentOf(state);

  const [mode, setMode] = useState<CoverageMode>('che-phu');
  const [face, setFace] = useState<'truoc' | 'sau'>('truoc');
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'nguoi' | 'kho-vu-khi'>('nguoi');
  const [message, setMessage] = useState('');

  const view: EquipmentView = useMemo(() => equipmentView(state), [state]);
  const build: Build = useMemo(() => {
    const appearance = character?.appearance;
    if (appearance === undefined) return AVERAGE_BUILD;
    return { musclePct: appearance.musclePct, fatPct: appearance.fatPct };
  }, [character?.appearance?.musclePct, character?.appearance?.fatPct]);

  const run = (result: { ops: PatchOp[]; refused: string }): void => {
    if (result.refused !== '') {
      setMessage(result.refused);
      return;
    }
    setMessage(commit(result.ops));
  };

  const selectedRegion = selected === null ? null : view.regions.find((region) => region.regionId === selected) ?? null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-ink/95 backdrop-blur">
      <header className="flex items-center justify-between border-b border-oak-light px-5 py-3">
        <div>
          <h2 className="text-sm tracking-[0.2em] text-brass uppercase">Túi đồ & trang bị</h2>
          <p className="text-xs text-vellum/50">
            {view.wornList.length} món trên người · {view.load.totalKg} kg · trị giá {view.totalValue} đồng
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setTab(tab === 'nguoi' ? 'kho-vu-khi' : 'nguoi')}>
            {tab === 'nguoi' ? 'Kho vũ khí' : 'Trên người'}
          </Button>
          <Button onClick={onClose}>Đóng</Button>
        </div>
      </header>

      {message !== '' && (
        <p className="border-b border-rust/40 bg-rust/10 px-5 py-2 text-xs text-rust">{message}</p>
      )}

      {tab === 'kho-vu-khi' ? (
        <Armoury view={view} />
      ) : (
        <div className="grid flex-1 grid-cols-[300px_minmax(0,1fr)_340px] gap-0 overflow-hidden">
          {/* --- Trái: túi đồ thật và kho sở hữu -------------------------- */}
          <section className="overflow-y-auto border-r border-oak-light">
            <h3 className="border-b border-oak-light px-3 py-2 text-xs tracking-[0.15em] text-brass uppercase">
              Túi đồ · {view.packList.length} món
            </h3>
            <ul>
              {view.packList.map((entry) => (
                <ItemRow
                  key={entry.item.id}
                  entry={entry}
                  action="Mặc"
                  onAction={() => run(equipOps(state, entry.item.id))}
                  onDragStart={() => setMessage('')}
                />
              ))}
              {view.packList.length === 0 && (
                <li className="px-3 py-3 text-sm text-vellum/40 italic">Túi đồ trống.</li>
              )}
            </ul>
            {view.packList.length > 0 && (
              <div className="border-b border-oak-light px-3 py-2 text-right">
                <p className="text-[10px] text-vellum/40">Cất từng món về kho bằng nút ở danh sách dưới.</p>
              </div>
            )}

            <h3 className="border-b border-oak-light px-3 py-2 text-xs tracking-[0.15em] text-brass uppercase">
              Kho sở hữu · {view.stashList.length} món
            </h3>
            <ul>
              {view.stashList.map((entry) => (
                <ItemRow
                  key={entry.item.id}
                  entry={entry}
                  action="Cho vào túi"
                  onAction={() => run(packOps(state, entry.item.id))}
                />
              ))}
              {view.stashList.length === 0 && (
                <li className="px-3 py-3 text-sm text-vellum/40 italic">Không có món nào cất ở kho.</li>
              )}
            </ul>

            {view.packList.length > 0 && (
              <div className="border-t border-oak-light px-3 py-2">
                <p className="mb-1 text-[10px] tracking-widest text-vellum/40 uppercase">Cất khỏi túi</p>
                <div className="flex flex-wrap gap-1">
                  {view.packList.map((entry) => (
                    <button
                      key={entry.item.id}
                      type="button"
                      onClick={() => run(stashOps(state, entry.item.id))}
                      className="max-w-full truncate rounded border border-oak-light px-1.5 py-0.5 text-[10px] text-vellum/60 hover:bg-oak-light"
                    >
                      {entry.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* --- Giữa: hình người --------------------------------------- */}
          <section
            className="flex flex-col items-center overflow-y-auto px-4 py-3"
            onDragOver={(event) => event.preventDefault()}
          >
            <div className="mb-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMode(mode === 'che-phu' ? 'giap' : 'che-phu')}
                className={`rounded border px-3 py-1 text-xs ${
                  mode === 'che-phu' ? 'border-brass bg-brass/15 text-brass' : 'border-oak-light text-vellum'
                }`}
              >
                Xem che phủ
              </button>
              <button
                type="button"
                onClick={() => setFace(face === 'truoc' ? 'sau' : 'truoc')}
                className="rounded border border-oak-light px-3 py-1 text-xs text-vellum hover:bg-oak-light"
              >
                Mặt {face === 'truoc' ? 'trước' : 'sau'}
              </button>
            </div>

            <CoverageBody
              regions={view.regions}
              mode={mode}
              view={face}
              build={build}
              {...(character?.appearance?.skin === undefined ? {} : { skinColor: character.appearance.skin })}
              selected={selected}
              onSelect={(regionId) => setSelected(regionId)}
            />

            <div className="mt-3 w-full max-w-md text-center text-xs text-vellum/60">
              {selectedRegion === null ? (
                <p className="italic">Bấm vào một vùng để xem chi tiết che phủ.</p>
              ) : (
                <>
                  <p className="text-sm text-vellum">{selectedRegion.name}</p>
                  <p>
                    che {selectedRegion.coverage}%
                    {selectedRegion.gapName === '' ? '' : ` — khe hở: ${selectedRegion.gapName}`}
                  </p>
                  <p className="font-mono">
                    chém {selectedRegion.chem} · đâm {selectedRegion.dam} · đập {selectedRegion.dap}
                  </p>
                  <p className="text-vellum/45">{describeSelected(view.coverage, selectedRegion.regionId)}</p>
                </>
              )}
            </div>

            {view.gaps.length > 0 && (
              <div className="mt-4 w-full max-w-md">
                <p className="mb-1 text-xs tracking-[0.15em] text-brass uppercase">Khe hở đang có</p>
                <ul className="space-y-0.5 text-xs text-vellum/70">
                  {view.gaps.slice(0, 8).map((gap) => (
                    <li key={gap.regionId} className="flex justify-between">
                      <span>{gap.gapName === '' ? gap.name : `${gap.name} — ${gap.gapName}`}</span>
                      <span className="font-mono text-rust">
                        {gap.coverage <= 0 ? 'trần' : `hở ${100 - gap.coverage}%`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* --- Phải: bốn khung của mục 18 ------------------------------ */}
          <section className="space-y-4 overflow-y-auto border-l border-oak-light px-3 py-3">
            <div>
              <h3 className="mb-2 text-xs tracking-[0.15em] text-brass uppercase">Ba loại chống</h3>
              <ProtectionBars bars={view.bars} />
            </div>

            <div>
              <h3 className="mb-1 text-xs tracking-[0.15em] text-brass uppercase">Trọng lượng và phân bổ</h3>
              <ul className="space-y-0.5 text-xs text-vellum/70">
                <li className="flex justify-between">
                  <span>Tổng tải</span>
                  <span className="font-mono">{view.load.totalKg} kg</span>
                </li>
                {Object.entries(view.load.byCarry).map(([carry, kg]) => (
                  <li key={carry} className="flex justify-between pl-3 text-vellum/50">
                    <span>{carryModeOf(carry)?.name ?? carry}</span>
                    <span className="font-mono">{kg} kg</span>
                  </li>
                ))}
                <li className="flex justify-between">
                  <span>Mệt thêm mỗi hiệp</span>
                  <span className="font-mono">{view.load.fatiguePerRound}</span>
                </li>
                <li className="flex justify-between">
                  <span>Phạt bơi</span>
                  <span className="font-mono">−{view.load.swimPenalty}</span>
                </li>
              </ul>
              <button
                type="button"
                onClick={() => run(beltOps(state, !(equipment?.belted ?? true)))}
                className="mt-2 rounded border border-oak-light px-2 py-0.5 text-[11px] text-vellum hover:bg-oak-light"
              >
                {equipment?.belted ?? true ? 'Tháo đai và móc treo' : 'Thắt đai và móc treo'}
              </button>
            </div>

            {view.warnings.length > 0 && (
              <ul className="space-y-1 rounded border border-rust/40 bg-rust/10 px-2 py-1.5 text-[11px] text-rust">
                {view.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}

            <div>
              <h3 className="mb-1 text-xs tracking-[0.15em] text-brass uppercase">Đang mặc</h3>
              <ul>
                {view.wornList.map((entry) => (
                  <ItemRow
                    key={entry.item.id}
                    entry={entry}
                    action="Cởi"
                    onAction={() => run(unequipOps(state, entry.item.id))}
                  />
                ))}
                {view.wornList.length === 0 && (
                  <li className="px-2 py-2 text-sm text-vellum/40 italic">Không mặc gì cả.</li>
                )}
              </ul>
            </div>

            <div>
              <h3 className="mb-1 text-xs tracking-[0.15em] text-brass uppercase">Bảo dưỡng</h3>
              {view.maintenance.length === 0 ? (
                <p className="text-xs text-vellum/40 italic">Mọi món còn nguyên.</p>
              ) : (
                <ul className="space-y-1.5">
                  {view.maintenance.map((row) => (
                    <li key={row.itemId} className="text-xs text-vellum/70">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 truncate">{row.name}</span>
                        <button
                          type="button"
                          onClick={() => run(maintainOps(state, row.itemId, Math.max(1, row.hours)))}
                          className="shrink-0 rounded border border-oak-light px-2 py-0.5 text-[11px] hover:bg-oak-light"
                        >
                          Chăm {row.hours} giờ
                        </button>
                      </div>
                      <p className="text-[11px] text-vellum/45">{row.line}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kho vũ khí của thành trì (mục 18, dòng cuối)
// ---------------------------------------------------------------------------

/**
 * TRANG BỊ CHO QUÂN ĐỒN TRÚ HÀNG LOẠT.
 *
 * Đây là bài toán KHÁC với mặc giáp cho một người, và mục 11 nói thẳng vì sao:
 * chọn giữa nhiều đồ tầm thường hay ít đồ tốt. Nên bảng này không hỏi "ai mặc
 * gì" mà hỏi "kho có bao nhiêu bộ, đủ cho bao nhiêu người, và một người trung
 * bình sẽ ra trận với mức che phủ nào".
 */
function Armoury({ view }: { view: EquipmentView }): ReactNode {
  const report = useMemo(
    () => armouryReport([...view.packList, ...view.stashList].map((entry) => entry.item)),
    [view.packList, view.stashList],
  );

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      <h3 className="mb-1 text-xs tracking-[0.15em] text-brass uppercase">Kho vũ khí</h3>
      <p className="mb-4 text-xs text-vellum/50">
        {report.sets} bộ đủ dùng · trang bị được {report.soldiers} người · tổng trị giá {report.value} đồng
        {report.value > 0 && ` (bằng ${valueInPeasantYears({ ...report.sample, value: report.value })} năm của một nông dân)`}
      </p>

      <table className="w-full text-left text-xs">
        <thead className="text-vellum/50">
          <tr className="border-b border-oak-light">
            <th className="py-1.5">Món</th>
            <th className="py-1.5 text-right">Số lượng</th>
            <th className="py-1.5 text-right">Bậc trung bình</th>
            <th className="py-1.5 text-right">Tình trạng TB</th>
            <th className="py-1.5 text-right">Trị giá</th>
          </tr>
        </thead>
        <tbody className="text-vellum/80">
          {report.rows.map((row) => (
            <tr key={row.templateId} className="border-b border-oak-light/30">
              <td className="py-1.5">{itemName(row.templateId)}</td>
              <td className="py-1.5 text-right font-mono">{row.count}</td>
              <td className="py-1.5 text-right">{qualityByLevel(row.avgQuality).name}</td>
              <td className="py-1.5 text-right font-mono">{row.avgCondition}</td>
              <td className="py-1.5 text-right font-mono">{row.value}</td>
            </tr>
          ))}
          {report.rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-3 text-vellum/40 italic">
                Kho trống.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {report.needsWork.length > 0 && (
        <div className="mt-5">
          <h4 className="mb-1 text-xs tracking-[0.15em] text-brass uppercase">Cần thợ rèn</h4>
          <ul className="space-y-1 text-xs text-vellum/70">
            {report.needsWork.map((entry) => (
              <li key={entry.id}>
                {entry.name} — {maintenancePlan(entry).line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
