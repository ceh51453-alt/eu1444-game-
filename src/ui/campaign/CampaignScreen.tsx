/**
 * MÀN HÌNH CHIẾN ĐỒ — bản đồ, đường dẫn ba tầng, và bảng lệnh bên phải.
 *
 * Khác `WorldScreen` ở một điểm căn bản: màn hình này CÓ GHI STATE. Tab Thế giới
 * là một cái cửa sổ để nhìn ra ngoài; chiến đồ là chỗ người chơi ra lệnh — hành
 * quân, vây thành, chiếm, đòi thần phục. Mọi lệnh đều đi qua `commitCampaign`,
 * nghĩa là qua MVU, nghĩa là undo tua lại được (R2).
 *
 * Bảng bên phải luôn nói RÕ VÌ SAO một nút bị chặn. `canCapture` trả về câu giải
 * thích chứ không trả về `false`, và câu ấy được in thẳng ra: người chơi đứng
 * trước một thành trì với cái nút mờ đi không lời nào sẽ đi tìm lỗi trong game
 * chứ không đi đánh nốt cái thị trấn còn lại.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { useGameStore } from '@/state/store';
import {
  ancestorAtLevel,
  ancestryOf,
  campaignNode,
  campaignStateOf,
  canCapture,
  captureObjective,
  childrenOfNode,
  conquestOf,
  emptyCampaign,
  factionColor,
  factionName,
  holderOf,
  isUnder,
  objectivesUnder,
  orderMarch,
  paintOf,
  placementOf,
  releaseVassal,
  statusOf,
  submitAsVassal,
  terrainRow,
  beginSiege,
  type CampaignSliceState,
} from '@/systems/campaign';
import { CampaignMap, remainingLabels } from './CampaignMap';
import { commitCampaign, syncPlayerArmies, type PlayerForceRow } from './campaign';

export interface CampaignScreenProps {
  /** Bản chụp lúc mở. Màn hình vẫn nghe store để lệnh vừa ra hiện ra ngay. */
  initial: CampaignSliceState;
  playerFactionId: string;
  hereNodeId: string;
  forces: readonly PlayerForceRow[];
  onOpenBattle?: () => void;
  onOpenSiege?: () => void;
}

const STANCE_LABEL: Readonly<Record<string, string>> = {
  'dong-quan': 'đóng quân',
  'hanh-quan': 'đang hành quân',
  'vay-thanh': 'đang vây thành',
  'chiem-dong': 'đang chiếm đóng',
};

const STATUS_LABEL: Readonly<Record<string, string>> = {
  'nguyen-ven': 'nguyên vẹn',
  'tranh-chap': 'đang tranh chấp',
  'da-doi-chu': 'đã đổi chủ',
};

/** Đọc slice `campaign` sống. Cùng cái bẫy `Object.is` mà `useWorld` đã ghi chú. */
function useCampaign(fallback: CampaignSliceState): CampaignSliceState {
  const raw = useGameStore((store) => (store as unknown as Record<string, unknown>)['campaign']);
  return useMemo(() => {
    const parsed = campaignStateOf({ campaign: raw } as never);
    return parsed ?? fallback;
  }, [raw, fallback]);
}

export function CampaignScreen({ initial, playerFactionId, hereNodeId, forces, onOpenBattle, onOpenSiege }: CampaignScreenProps): ReactNode {
  const campaign = useCampaign(initial);
  const [focusId, setFocusId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [armyId, setArmyId] = useState('');
  const [note, setNote] = useState('');

  const selected = selectedId === '' ? null : campaignNode(selectedId);
  const focus = focusId === '' ? null : campaignNode(focusId);
  const phe = playerFactionId === '' ? campaign.playerFactionId : playerFactionId;

  const chuaLenBanDo = forces.filter((force) => !campaign.armies.some((army) => army.forceId === force.id));
  const quanCuaTa = campaign.armies.filter((army) => army.factionId === phe);
  const army = campaign.armies.find((row) => row.id === armyId) ?? null;

  const run = (result: { campaign: CampaignSliceState; refused: string; lines: string[] }, reason: string): void => {
    if (result.refused !== '') {
      setNote(result.refused);
      return;
    }
    if (!commitCampaign(result.campaign, reason)) {
      setNote('patch bị từ chối — state giữ nguyên');
      return;
    }
    setNote(result.lines[0] ?? '');
  };

  const duaQuanLen = (): void => {
    const synced = syncPlayerArmies(campaign, forces, { factionId: phe, hereNodeId });
    if (synced.campaign === campaign) {
      setNote(hereNodeId === '' ? 'chưa tra được ngài đang đứng ở ô nào trên chiến đồ' : 'không có đạo quân nào để đưa lên');
      return;
    }
    if (!commitCampaign(synced.campaign, 'đưa đạo quân của người chơi lên chiến đồ')) return;
    setNote(synced.lines[0] ?? 'đã đưa quân lên chiến đồ');
  };

  const breadcrumb = focus === null ? [] : ancestryOf(focus.id);
  const shownLevel = focus === null ? 1 : focus.level === 1 ? 2 : 3;
  const levelName = shownLevel === 1 ? 'Quốc gia' : shownLevel === 2 ? 'Vùng' : 'Huyện';

  return (
    <div className="flex h-full min-h-0 bg-[#0c1619]">
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <CampaignMap
          campaign={campaign}
          focusId={focusId}
          selectedId={selectedId}
          playerFactionId={phe}
          hereNodeId={hereNodeId === '' ? '' : (ancestorAtLevel(hereNodeId, focus === null ? 1 : focus.level === 1 ? 2 : 3)?.id ?? '')}
          onSelect={(id) => setSelectedId(id)}
          onDrill={(id) => {
            const node = campaignNode(id);
            if (node === null || node.level >= 3) return;
            setFocusId(id);
            setSelectedId('');
          }}
        />

        <div className="pointer-events-none absolute left-3 top-3 max-w-[min(34rem,65%)] rounded-md border border-[#9d8454]/45 bg-[#15120e]/90 px-3 py-2 shadow-xl backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#c9aa6a]">Chiến đồ</span>
            <span className="h-px flex-1 bg-[#8f7548]/35" />
            <span className="font-mono text-[9px] uppercase tracking-widest text-vellum/45">Cấp {String(shownLevel)} · {levelName}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setFocusId('');
                setSelectedId('');
              }}
              className={`pointer-events-auto rounded-sm border px-2 py-0.5 text-[11px] ${
                focusId === '' ? 'border-[#d0ad64] bg-[#8f6d2d]/20 text-[#f0d89c]' : 'border-oak-light text-vellum/70 hover:border-[#8f7548]'
              }`}
            >
              Châu Âu
            </button>
            {breadcrumb.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => {
                  setFocusId(node.level >= 3 ? (node.parentId ?? '') : node.id);
                  setSelectedId(node.id);
                }}
                className="pointer-events-auto rounded-sm border border-oak-light px-2 py-0.5 text-[11px] text-vellum/75 hover:border-[#8f7548] hover:text-parchment"
              >
                <span className="mr-1 text-[#9d8454]">›</span>{node.name}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[9px] tracking-wide text-vellum/35">Kéo để dịch chuyển · cuộn để phóng · bấm để xem · bấm lần nữa để đi sâu</p>
        </div>

        <div className="pointer-events-none absolute left-1/2 top-3 hidden -translate-x-1/2 items-center rounded-md border border-[#8f7548]/35 bg-[#15120e]/80 p-1 shadow-lg backdrop-blur-sm 2xl:flex">
          {(['Quốc gia', 'Vùng', 'Huyện'] as const).map((name, index) => {
            const level = index + 1;
            return (
              <span key={name} className={`rounded px-2.5 py-1 text-[9px] uppercase tracking-widest ${shownLevel === level ? 'bg-[#9a7535]/28 text-[#f0d89c]' : 'text-vellum/35'}`}>
                {String(level)} · {name}
              </span>
            );
          })}
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-x-3 gap-y-1 rounded-md border border-[#8f7548]/40 bg-[#15120e]/88 px-3 py-2 text-[9px] text-vellum/60 shadow-xl backdrop-blur-sm">
          <LegendSwatch color="#efe2c2" label="thành trì" />
          <LegendSwatch color="#c9b68d" label="thị trấn" />
          <LegendSwatch color="#3f6b80" label="đường biển" />
          <span>màu quân hiệu = phe kiểm soát</span>
          <span>vòng sọc = chư hầu / tranh chấp</span>
          <span>vòng đỏ = đang bị vây</span>
        </div>
      </div>

      <aside className="w-80 shrink-0 space-y-2 overflow-y-auto border-l border-[#54462f] bg-[#15120e] p-2.5 shadow-2xl">
        <section className="rounded-md border border-[#6d5938]/60 bg-[#1b1712] p-2.5">
          <h3 className="text-[10px] uppercase tracking-[0.18em] text-[#b89a5e]">Phe của ngài</h3>
          <p className="mt-1 flex items-center gap-2 text-sm text-parchment">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: factionColor(phe) }} />
            {phe === '' ? 'chưa thuộc về ai' : factionName(phe)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            <button
              type="button"
              onClick={duaQuanLen}
              disabled={chuaLenBanDo.length === 0}
              className="rounded border border-oak-light px-2 py-0.5 text-[11px] text-vellum/80 disabled:opacity-40"
            >
              Đưa quân lên chiến đồ{chuaLenBanDo.length > 0 ? ` (${String(chuaLenBanDo.length)})` : ''}
            </button>
          </div>
          {note !== '' && <p className="mt-2 border-l-2 border-brass/60 pl-2 text-[11px] text-vellum/70">{note}</p>}
        </section>

        <ArmyList
          armies={quanCuaTa}
          selectedId={armyId}
          onSelect={(id) => setArmyId(id === armyId ? '' : id)}
        />

        {selected === null ? (
          <p className="rounded border border-oak/60 p-2 text-[11px] text-vellum/50">
            Chọn một ô để xem ai đang giữ nó và còn phải hạ những đâu.
          </p>
        ) : (
          <NodePanel
            campaign={campaign}
            nodeId={selected.id}
            factionId={phe}
            armyId={armyId}
            onDrill={() => {
              if (selected.level >= 3) return;
              setFocusId(selected.id);
              setSelectedId('');
            }}
            onMarch={() => {
              if (army === null) {
                setNote('chọn một đạo quân trước đã');
                return;
              }
              run(orderMarch(campaign, { armyId: army.id, toNodeId: selected.id }), `hành quân tới ${selected.name}`);
            }}
            onSiege={() => {
              if (army === null) {
                setNote('chọn một đạo quân trước đã');
                return;
              }
              const result = beginSiege(campaign, army.id, selected.id);
              if (result.refused !== '') {
                setNote(result.refused);
                return;
              }
              if (!commitCampaign(result.campaign, `vây ${selected.name}`)) {
                setNote('không ghi được lệnh vây thành');
                return;
              }
              setNote(result.lines[0] ?? 'đã hạ trại vây thành');
              onOpenSiege?.();
            }}
            onBattle={() => onOpenBattle?.()}
            onCapture={() => run(captureObjective(campaign, selected.id, phe), `chiếm ${selected.name}`)}
            onVassalise={(vassalId) => run(submitAsVassal(campaign, vassalId, phe), 'nhận thần phục')}
            onRelease={(vassalId) => run(releaseVassal(campaign, vassalId), 'cắt lời thề chư hầu')}
          />
        )}
      </aside>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }): ReactNode {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

interface ArmyListProps {
  armies: readonly { id: string; name: string; troops: number; stance: string; nodeId: string; march: unknown }[];
  selectedId: string;
  onSelect: (id: string) => void;
}

function ArmyList({ armies, selectedId, onSelect }: ArmyListProps): ReactNode {
  if (armies.length === 0) {
    return <p className="rounded border border-oak/60 p-2 text-[11px] text-vellum/50">Chưa có đạo quân nào của ngài trên chiến đồ.</p>;
  }
  return (
    <section className="rounded border border-oak/60 p-2">
      <h3 className="text-[11px] uppercase tracking-widest text-vellum/50">Quân của ngài</h3>
      <ul className="mt-1 space-y-1">
        {armies.map((row) => {
          const army = row as unknown as Parameters<typeof placementOf>[0];
          const cho = placementOf(army);
          const dangO = campaignNode(cho.fromId);
          const sapToi = cho.toId === '' ? null : campaignNode(cho.toId);
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onSelect(row.id)}
                className={`w-full rounded border p-1.5 text-left ${
                  row.id === selectedId ? 'border-brass bg-oak/40' : 'border-oak/60 hover:bg-oak/20'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs text-parchment">{row.name}</span>
                  <span className="font-mono text-[10px] text-vellum/50">{String(row.troops)}</span>
                </div>
                <p className="truncate text-[10px] text-vellum/50">
                  {STANCE_LABEL[row.stance] ?? row.stance}
                  {cho.moving && sapToi !== null
                    ? ` · ${dangO?.name ?? cho.fromId} → ${sapToi.name}, còn ${String(cho.daysLeft)} ngày (${String(cho.kmLeft)} km)`
                    : ` · ${dangO?.name ?? cho.fromId}`}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface NodePanelProps {
  campaign: CampaignSliceState;
  nodeId: string;
  factionId: string;
  armyId: string;
  onDrill: () => void;
  onMarch: () => void;
  onSiege: () => void;
  onBattle: () => void;
  onCapture: () => void;
  onVassalise: (vassalId: string) => void;
  onRelease: (vassalId: string) => void;
}

function NodePanel({
  campaign,
  nodeId,
  factionId,
  armyId,
  onDrill,
  onMarch,
  onSiege,
  onBattle,
  onCapture,
  onVassalise,
  onRelease,
}: NodePanelProps): ReactNode {
  const node = campaignNode(nodeId);
  if (node === null) return null;

  const paint = paintOf(campaign, nodeId);
  const holder = holderOf(campaign, nodeId);
  const tienDo = factionId === '' ? null : conquestOf(campaign, nodeId, factionId);
  const conLai = factionId === '' ? [] : remainingLabels(campaign, nodeId, factionId);
  const capture = factionId === '' ? 'chưa rõ phe của ngài' : canCapture(campaign, nodeId, factionId);
  const quanTaiCho = campaign.armies.filter((row) => row.nodeId === nodeId && row.stance !== 'hanh-quan');
  const quanTa = quanTaiCho.some((row) => row.id === armyId && row.factionId === factionId);
  const coDich = quanTaiCho.some((row) => row.factionId !== factionId);
  const laChuHau = holder !== '' && factionId !== '' && isUnder(campaign, holder, factionId) && holder !== factionId;

  /**
   * ĐÒI THẦN PHỤC chỉ mở khi đã nắm quá nửa số mục tiêu của cả nước.
   *
   * Không có ngưỡng ấy thì "khuất phục chư hầu" biến thành một cái nút bấm là
   * xong, và cả cơ chế vây thành mất lý do tồn tại. Nửa số thành trì trong tay
   * là đúng lúc một triều đình bắt đầu tính chuyện quỳ thay vì chết.
   */
  const quocGia = ancestorAtLevel(nodeId, 1);
  const apLuc = quocGia === null || factionId === '' ? null : conquestOf(campaign, quocGia.id, factionId);
  const chuNuoc = quocGia === null ? '' : holderOf(campaign, quocGia.id);
  const doiDuocThanPhuc =
    apLuc !== null &&
    quocGia !== null &&
    chuNuoc !== '' &&
    chuNuoc !== factionId &&
    !isUnder(campaign, chuNuoc, factionId) &&
    apLuc.total > 0 &&
    apLuc.held * 2 >= apLuc.total;

  return (
    <section className="space-y-2 rounded border border-oak/60 p-2">
      <header>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate text-sm text-parchment">{node.siteName === '' ? node.name : node.siteName}</h3>
          <span className="shrink-0 text-[10px] uppercase text-vellum/40">
            {node.level === 1 ? 'quốc gia' : node.level === 2 ? 'vùng' : 'huyện'}
          </span>
        </div>
        <p className="text-[11px] text-vellum/50">
          {terrainRow(node.terrain).name}
          {node.water ? ' · mặt nước, phải có thuyền' : ''}
          {node.island ? ' · đảo' : ''}
          {node.port ? ' · cảng' : ''}
          {node.seat ? ' · thủ phủ' : ''}
          {node.fort > 0 ? ` · công sự bậc ${String(node.fort)}` : ''}
        </p>
      </header>

      {!node.water && (
        <div className="flex items-center gap-2 text-[11px]">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: paint.fill }} />
          <span className="text-vellum/80">{factionName(holder)}</span>
          {paint.controllerId !== '' && paint.controllerId !== holder && (
            <span className="text-vellum/50">— chư hầu của {factionName(paint.controllerId)}</span>
          )}
          <span className="ml-auto text-vellum/40">{STATUS_LABEL[statusOf(campaign, nodeId)] ?? ''}</span>
        </div>
      )}

      {tienDo !== null && tienDo.total > 0 && (
        <div className="rounded border border-oak/50 p-1.5">
          <p className="text-[11px] text-vellum/70">
            Tiến độ chinh phục: <span className="font-mono text-parchment">{String(tienDo.held)}/{String(tienDo.total)}</span> mục tiêu
            {tienDo.byVassal > 0 ? ` (${String(tienDo.byVassal)} nhờ chư hầu)` : ''}
          </p>
          <div className="mt-1 h-1.5 overflow-hidden rounded bg-oak">
            <div
              className="h-full bg-brass"
              style={{ width: `${String(Math.round((tienDo.held / Math.max(1, tienDo.total)) * 100))}%` }}
            />
          </div>
          {tienDo.fallen ? (
            <p className="mt-1 text-[11px] text-[#8eb177]">
              {tienDo.byHomage ? 'đã quy phục — đất này nghe lệnh ngài' : 'đã chiếm trọn'}
            </p>
          ) : (
            <ul className="mt-1 space-y-0.5 text-[10px] text-vellum/60">
              {conLai.map((label) => (
                <li key={label}>· {label}</li>
              ))}
              {tienDo.remaining.length > conLai.length && (
                <li className="text-vellum/40">… còn {String(tienDo.remaining.length - conLai.length)} nơi nữa</li>
              )}
            </ul>
          )}
        </div>
      )}

      {quanTaiCho.length > 0 && (
        <p className="text-[11px] text-vellum/60">
          Tại chỗ: {quanTaiCho.map((row) => `${row.name} (${STANCE_LABEL[row.stance] ?? row.stance})`).join(', ')}
        </p>
      )}

      <div className="flex flex-wrap gap-1">
        {node.level < 3 && (
          <button type="button" onClick={onDrill} className="rounded border border-oak-light px-2 py-0.5 text-[11px] text-vellum/80">
            Xem bên trong
          </button>
        )}
        <button
          type="button"
          onClick={onMarch}
          disabled={armyId === ''}
          className="rounded border border-oak-light px-2 py-0.5 text-[11px] text-vellum/80 disabled:opacity-40"
          title={armyId === '' ? 'chọn một đạo quân ở bảng trên' : 'kéo quân tới đây'}
        >
          Hành quân tới đây
        </button>
        {node.level === 3 && node.site !== '' && node.site !== 'lang' && (
          <button
            type="button"
            onClick={onSiege}
            disabled={armyId === ''}
            className="rounded border border-oak-light px-2 py-0.5 text-[11px] text-vellum/80 disabled:opacity-40"
          >
            Mở công thành
          </button>
        )}
        {quanTa && coDich && (
          <button
            type="button"
            onClick={onBattle}
            className="rounded border border-rust/70 px-2 py-0.5 text-[11px] text-rust"
          >
            Mở dã chiến
          </button>
        )}
        {node.level === 3 && node.fort === 0 && (
          <button
            type="button"
            onClick={onCapture}
            disabled={capture !== ''}
            className="rounded border border-brass/60 px-2 py-0.5 text-[11px] text-brass disabled:border-oak-light disabled:text-vellum/40"
            title={capture === '' ? 'chiếm ô này' : capture}
          >
            Tiếp quản
          </button>
        )}
        {doiDuocThanPhuc && (
          <button
            type="button"
            onClick={() => onVassalise(chuNuoc)}
            className="rounded border border-brass/60 px-2 py-0.5 text-[11px] text-brass"
            title="đủ áp lực để đòi triều đình ấy quỳ"
          >
            Đòi thần phục
          </button>
        )}
        {laChuHau && (
          <button
            type="button"
            onClick={() => onRelease(holder)}
            className="rounded border border-oak-light px-2 py-0.5 text-[11px] text-vellum/70"
          >
            Cắt lời thề
          </button>
        )}
      </div>

      {node.level === 3 && capture !== '' && <p className="text-[10px] text-vellum/50">Chưa chiếm được: {capture}</p>}

      {node.level < 3 && (
        <p className="text-[10px] text-vellum/40">
          {String(childrenOfNode(node.id).length)} ô bên trong · {String(objectivesUnder(node.id).length)} mục tiêu phải hạ
        </p>
      )}
    </section>
  );
}

export function emptyCampaignScreenState(): CampaignSliceState {
  return emptyCampaign();
}
