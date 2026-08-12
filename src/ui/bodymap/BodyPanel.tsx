/**
 * PANEL "CƠ THỂ" (Phần 7 mục 10).
 *
 * Sáu phần, đúng danh sách của mục 10:
 *   · hình SVG, gạt trước/sau, click vùng để mở chi tiết
 *   · năm thanh: máu, đau, sốt, thể lực, ý thức
 *   · danh sách thương tích, sắp theo mức nguy hiểm
 *   · khung "Đang chịu phạt" — lấy THẲNG từ registry của Phần 5
 *   · nút chữa trị: phương pháp khả dụng, yêu cầu, rủi ro, và ai chữa
 *   · dòng thời gian thương tích
 *
 * KHUNG "ĐANG CHỊU PHẠT" LÀ PHẦN QUAN TRỌNG NHẤT Ở ĐÂY. Game không có reroll,
 * nên người chơi BẮT BUỘC phải biết vì sao mình yếu đi (README mục 8.4). Nó
 * hiện mức phạt ở BỐN miền khác nhau — kỹ năng, chiến đấu, quản trị, xã giao —
 * vì mục 5 nói thương tích phải lan ra ngoài chiến đấu, và một khung chỉ hiện
 * miền chiến đấu sẽ giấu mất đúng cái nửa ấy.
 */

import { useMemo, useState, type ReactNode } from 'react';
import type { CheckSystem } from '@/core/turn';
import { applyPatch } from '@/state/mvu';
import { rngHubFor, useGameStore } from '@/state/store';
import type { GameState } from '@/state/slices';
import { collectModifiers, type Modifier } from '@/systems/check';
import { characterOf } from '@/systems/character';
import {
  BODY_STREAM,
  allHealers,
  allTreatments,
  bodyOf,
  bodySummary,
  canTreat,
  healerAdvice,
  healerSkillEstimate,
  injuryViews,
  permanentName,
  regionStatuses,
  treat,
} from '@/systems/body';
import { Panel } from '@/ui/shell/AppShell';
import { BodyMap } from './BodyMap';
import { AVERAGE_BUILD } from './silhouette';

/** Bốn miền đại diện — đúng bốn cõi mà mục 5 nói thương tích phải lan tới. */
const PROBES: readonly { label: string; domain: string; system: CheckSystem }[] = [
  { label: 'Kỹ năng', domain: 'skill.chung', system: 'd100' },
  { label: 'Chiến đấu', domain: 'combat.duel', system: 'd20' },
  { label: 'Quản trị', domain: 'admin.cai-tri', system: '3d6' },
  { label: 'Xã giao', domain: 'social.dam-phan', system: 'd100' },
];

function Bar({
  label,
  value,
  max = 100,
  tone,
  hint,
}: {
  label: string;
  value: number;
  max?: number;
  tone: string;
  hint?: string;
}): ReactNode {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between text-[0.7rem]">
        <span className="text-vellum/60">{label}</span>
        <span className="font-mono text-parchment" title={hint}>
          {Math.round(value)}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded bg-black/40">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function penaltyLines(state: GameState): { probe: string; lines: Modifier[] }[] {
  return PROBES.map((probe) => {
    const collected = collectModifiers({
      domain: probe.domain,
      system: probe.system,
      difficulty: 'thuong',
      state,
      actor: '',
      tags: [],
    });
    return {
      probe: probe.label,
      lines: collected.modifiers.filter((line) => line.source.startsWith('body.')),
    };
  }).filter((entry) => entry.lines.length > 0);
}

export function BodyPanel(): ReactNode {
  const state = useGameStore((store) => store as unknown as GameState);
  const [view, setView] = useState<'truoc' | 'sau'>('truoc');
  const [selected, setSelected] = useState<string | null>(null);
  const [injuryId, setInjuryId] = useState<string | null>(null);
  const [healerId, setHealerId] = useState<string>('tu-chua');
  const [message, setMessage] = useState<string>('');

  const body = bodyOf(state);
  const summary = useMemo(() => bodySummary(state), [state]);
  const statuses = useMemo(() => regionStatuses(state), [state]);
  const injuries = useMemo(() => injuryViews(state), [state]);
  const penalties = useMemo(() => penaltyLines(state), [state]);

  const character = characterOf(state);
  const build = useMemo(() => {
    const appearance = character?.appearance;
    return appearance === undefined
      ? AVERAGE_BUILD
      : { musclePct: appearance.musclePct, fatPct: appearance.fatPct };
  }, [character?.appearance]);

  if (body === null || summary === null) {
    return (
      <Panel title="Cơ thể">
        <p className="text-sm text-vellum/50 italic">Chưa có dữ liệu cơ thể.</p>
      </Panel>
    );
  }

  const chosen = injuries.find((injury) => injury.id === injuryId) ?? null;
  const raw = body.injuries.find((injury) => injury.id === injuryId) ?? null;
  const options = raw === null ? [] : allTreatments().filter((treatment) => canTreat(raw, treatment));

  const runTreatment = (treatmentId: string): void => {
    if (raw === null) return;
    const store = useGameStore.getState();
    const snapshot = store.snapshot();
    const hub = rngHubFor(snapshot);

    const outcome = treat(snapshot, hub.stream(BODY_STREAM), {
      injuryId: raw.id,
      treatmentId,
      healerId,
      turn: snapshot.meta.turn,
    });

    if (!outcome.ran) {
      setMessage(outcome.blocked);
      return;
    }

    const applied = applyPatch(snapshot, outcome.ops, { actor: 'engine' });
    if (!applied.applied || applied.next === null) {
      // R4: lô hỏng thì state giữ NGUYÊN, và lý do phải hiện ra chứ không bị nuốt.
      setMessage(`Không ghi được: ${applied.failures.map((entry) => entry.message).join('; ')}`);
      return;
    }

    store.commitBatch(applied.next);
    store.commitRng(hub.getState());
    setMessage(outcome.log.join(' · '));
  };

  return (
    <Panel title="Cơ thể">
      {body.dead && (
        <p className="rounded border border-red-500/50 bg-red-500/10 px-2 py-1 text-xs text-red-200">
          ĐÃ CHẾT ở lượt {body.deathTurn} — {body.deathCause}
        </p>
      )}

      <div className="flex justify-center gap-1 text-[0.65rem]">
        {(['truoc', 'sau'] as const).map((side) => (
          <button
            key={side}
            type="button"
            onClick={() => setView(side)}
            className={`rounded border px-2 py-0.5 ${
              view === side ? 'border-brass text-brass' : 'border-oak-light text-vellum/60'
            }`}
          >
            {side === 'truoc' ? 'Mặt trước' : 'Mặt sau'}
          </button>
        ))}
      </div>

      <BodyMap
        statuses={statuses}
        view={view}
        build={build}
        {...(character?.appearance === undefined
          ? {}
          : { skinColor: skinToColor(character.appearance.skin) })}
        fever={summary.fever}
        selected={selected}
        onSelect={(id) => {
          setSelected(id);
          const first = injuries.find((injury) => injury.regionId === id);
          setInjuryId(first?.id ?? null);
        }}
      />

      <div className="flex flex-col gap-1.5">
        <Bar label="Máu" value={summary.blood} tone="bg-red-500/80" hint="Máu còn lại. Dưới 40 thì choáng, dưới 20 thì hôn mê." />
        <Bar label="Đau" value={summary.pain} tone="bg-amber-500/80" hint="Đã trừ theo ý chí (WIL)." />
        <Bar
          label="Sốt"
          value={summary.fever}
          tone="bg-fuchsia-500/70"
          hint={`Đang hướng tới ${summary.feverTarget}/100`}
        />
        <Bar label="Thể lực" value={summary.stamina} tone="bg-emerald-500/70" />
        <div className="flex items-baseline justify-between text-[0.7rem]">
          <span className="text-vellum/60">Ý thức</span>
          <span className="font-mono text-parchment">{summary.consciousness}</span>
        </div>
        <div className="flex items-baseline justify-between text-[0.7rem]">
          <span className="text-vellum/60">Đi lại · cầm nắm T/P</span>
          <span className="font-mono text-parchment">
            {summary.mobility}% · {summary.gripLeft}/{summary.gripRight}%
          </span>
        </div>
        {summary.bleedingPerTurn > 0 && (
          <p className="text-[0.7rem] text-red-300">Đang mất {summary.bleedingPerTurn} máu mỗi lượt.</p>
        )}
      </div>

      {/* --- Thương tích, nguy hiểm nhất đứng trước ------------------------- */}
      <div className="flex flex-col gap-1">
        <p className="text-[0.6rem] tracking-widest text-brass/80 uppercase">Thương tích</p>
        {injuries.length === 0 ? (
          <p className="text-xs text-vellum/50 italic">Lành lặn.</p>
        ) : (
          injuries.map((injury) => (
            <button
              key={injury.id}
              type="button"
              onClick={() => {
                setInjuryId(injury.id);
                setSelected(injury.regionId);
              }}
              className={`rounded border px-2 py-1 text-left text-[0.7rem] ${
                injuryId === injury.id ? 'border-brass/70 bg-brass/5' : 'border-oak-light'
              }`}
            >
              <span className="text-parchment">
                {injury.region}: {injury.description}
              </span>
              {injury.effect !== '' && <span className="block text-vellum/60">{injury.effect}</span>}
            </button>
          ))
        )}
      </div>

      {/* --- Tàn phế vĩnh viễn ---------------------------------------------- */}
      {body.permanent.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <p className="text-[0.6rem] tracking-widest text-brass/80 uppercase">Tàn phế vĩnh viễn</p>
          {body.permanent.map((entry) => (
            <p key={`${entry.id}-${entry.regionId}`} className="text-[0.7rem] text-vellum/70">
              {permanentName(entry.id)} — {entry.cause} (lượt {entry.turn})
            </p>
          ))}
        </div>
      )}

      {/* --- Đang chịu phạt: lấy thẳng từ registry Phần 5 -------------------- */}
      <div className="flex flex-col gap-1">
        <p className="text-[0.6rem] tracking-widest text-brass/80 uppercase">Đang chịu phạt</p>
        {penalties.length === 0 ? (
          <p className="text-xs text-vellum/50 italic">Cơ thể không phạt gì lúc này.</p>
        ) : (
          penalties.map((group) => (
            <div key={group.probe} className="flex flex-col gap-0.5">
              <p className="text-[0.65rem] text-vellum/40">{group.probe}</p>
              {group.lines.map((line, index) => (
                <div key={`${line.source}-${index}`} className="flex items-baseline justify-between gap-2 text-[0.7rem]">
                  <span className="truncate text-vellum/70" title={`nguồn: ${line.source}`}>
                    {line.label}
                  </span>
                  <span className={`font-mono ${line.value < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                    {line.value >= 0 ? '+' : ''}
                    {line.value}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* --- Chữa trị -------------------------------------------------------- */}
      {chosen !== null && raw !== null && (
        <div className="flex flex-col gap-1 border-t border-oak-light pt-2">
          <p className="text-[0.6rem] tracking-widest text-brass/80 uppercase">
            Chữa {chosen.region} — {chosen.description}
          </p>

          <label className="flex items-center justify-between gap-2 text-[0.7rem] text-vellum/60">
            Người chữa
            <select
              value={healerId}
              onChange={(event) => setHealerId(event.target.value)}
              className="rounded border border-oak-light bg-ink px-1 py-0.5 text-parchment"
            >
              {allHealers().map((healer) => (
                <option key={healer.id} value={healer.id}>
                  {healer.name}
                </option>
              ))}
            </select>
          </label>

          {options.length === 0 ? (
            <p className="text-xs text-vellum/50 italic">Không phương pháp nào dùng được cho vết này.</p>
          ) : (
            options.map((treatment) => {
              const advice = healerAdvice(healerId, treatment.id);
              const skill = healerSkillEstimate(state, allHealers().find((h) => h.id === healerId) ?? allHealers()[0]!, treatment);
              return (
                <div key={treatment.id} className="rounded border border-oak-light px-2 py-1">
                  <button
                    type="button"
                    onClick={() => runTreatment(treatment.id)}
                    disabled={body.dead}
                    className="w-full text-left text-[0.72rem] text-parchment hover:text-brass disabled:opacity-40"
                  >
                    {treatment.name}
                    {treatment.harmful && <span className="text-red-300"> · CÓ HẠI</span>}
                  </button>
                  <p className="text-[0.65rem] text-vellum/60">{treatment.summary}</p>
                  <p className="text-[0.65rem] text-vellum/40">
                    kỹ năng ~{skill} · độ khó {treatment.difficulty} · {treatment.price} đồng
                    {treatment.supplies.length > 0 && ` · cần ${treatment.supplies.join(', ')}`}
                  </p>
                  <p className="text-[0.65rem] text-amber-200/70">{treatment.risks}</p>
                  {advice !== '' && <p className="text-[0.65rem] text-brass">{advice}</p>}
                </div>
              );
            })
          )}
          {message !== '' && <p className="text-[0.68rem] text-vellum/80">{message}</p>}
        </div>
      )}

      {/* --- Dòng thời gian --------------------------------------------------- */}
      {body.log.length > 0 && (
        <div className="flex flex-col gap-0.5 border-t border-oak-light pt-2">
          <p className="text-[0.6rem] tracking-widest text-brass/80 uppercase">Dòng thời gian</p>
          <div className="max-h-40 overflow-y-auto">
            {[...body.log].reverse().slice(0, 40).map((entry, index) => (
              <p key={`${entry.turn}-${index}`} className="text-[0.65rem] text-vellum/60">
                <span className="font-mono text-vellum/40">L{entry.turn}</span> {entry.text}
              </p>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

/**
 * Màu da từ chữ mô tả của Phần 6.
 *
 * `data/races.json` khai màu da bằng LỜI ("rám nắng", "xanh xám"), vì đó là thứ
 * đi vào prompt. Bản đồ cơ thể thì cần một mã màu, nên chỗ dịch nằm ở đây —
 * trong UI — chứ không nhét một mã hex vào file nội dung mà AI phải đọc.
 */
function skinToColor(skin: string): string {
  const text = skin.toLowerCase();
  const table: readonly [string, string][] = [
    ['xanh', '#7d9a86'],
    ['xám', '#8d8d96'],
    ['tro', '#9a938c'],
    ['đen', '#5b4436'],
    ['nâu', '#8b5e3c'],
    ['đồng', '#a9713f'],
    ['rám', '#c08a55'],
    ['ngăm', '#a97b52'],
    ['tái', '#d8c3a5'],
    ['trắng', '#e6cdb2'],
    ['nhợt', '#dcc9b6'],
    ['đỏ', '#c07a63'],
    ['vàng', '#d7b078'],
  ];
  for (const [needle, color] of table) {
    if (text.includes(needle)) return color;
  }
  return '#c9a227';
}
