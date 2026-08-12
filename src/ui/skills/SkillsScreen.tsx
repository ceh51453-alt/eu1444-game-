/**
 * TAB "KỸ NĂNG" (Phần 8 mục 11).
 *
 * Năm khung, đúng danh sách của mục 11:
 *   · danh sách kỹ năng theo 10 nhóm — bậc, số hiện tại, thanh tiến độ thực hành,
 *     và TRẦN HIỆN TẠI KÈM LÝ DO
 *   · đồ thị nhánh kéo thả của kỹ năng đang chọn
 *   · khung "Tải học tập": load, hệ số chậm, cảnh báo khi vượt 1.5
 *   · khung "Thầy đã biết": ai, dạy gì, ở đâu, giá, quan hệ hiện tại
 *   · nghĩa vụ đang nợ thầy, hiện rõ, có hạn chót
 *
 * TRẦN KÈM LÝ DO là phần quan trọng nhất ở đây, không phải cái đồ thị. Người
 * chơi luyện kiếm suốt hai trăm lượt rồi đứng yên ở 60 — nếu màn hình không nói
 * ra vì sao thì họ kết luận game hỏng, và họ có lý (README mục 8.4).
 *
 * Màn hình này mở thành lớp phủ toàn màn hình chứ không nhét vào cột phải rộng
 * 320px: một đồ thị kéo thả trong một cột hẹp thì kéo thả cũng vô ích.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { applyPatch } from '@/state/mvu';
import type { GameState } from '@/state/slices';
import { useGameStore } from '@/state/store';
import { Button, Select, TextInput } from '@/ui/settings/controls';
import { allSkills, groupName, skillGroups, skillName, skillsInGroup } from '@/systems/character';
import {
  baseThreshold,
  beginStudy,
  bestTeacherFor,
  canTeach,
  capReport,
  graphOf,
  levelOf,
  planStudy,
  practiceThreshold,
  priceKindOf,
  priceKinds,
  rememberTeacher,
  setStance,
  skillsOf,
  slowBreakdown,
  teacherQuality,
  tierName,
  unlockNode,
} from '@/systems/skills';
import { SkillGraph } from './SkillGraph';

function useGameState(): GameState {
  return useGameStore((store) => store as unknown as GameState);
}

/** Áp một lô op của engine và chốt vào store. Trả về lời báo lỗi nếu MVU từ chối. */
function commit(ops: unknown): string {
  const list = ops as Parameters<typeof applyPatch>[1];
  if (list.length === 0) return '';
  const store = useGameStore.getState();
  const snapshot = store.snapshot();
  const applied = applyPatch(snapshot, list, { actor: 'engine' });
  if (!applied.applied || applied.next === null) {
    return `Không ghi được: ${applied.failures.map((entry) => entry.message).join('; ')}`;
  }
  store.commitBatch(applied.next);
  return '';
}

/**
 * GHI LẠI MỘT NGƯỜI THẦY VỪA TÌM RA.
 *
 * Tìm thầy là hoạt động THẾ GIỚI THẬT (mục 8): hỏi thăm, lần theo tin đồn
 * lorebook, được tiến cử, hoặc thầy tự tìm đến khi danh vọng đủ cao. Cái ô này
 * KHÔNG thay thế chuyện đó — nó chỉ là chỗ chép lại vào state một người mà
 * truyện vừa giới thiệu, giống hệt cách người chơi tự ghi vào sổ tay.
 *
 * Vì sao không để AI ghi thẳng: trình độ của thầy là con số quyết định TRẦN kỹ
 * năng (mục 2). Cho AI viết nó là cho AI quyết một con số cơ học, và R1 cấm đúng
 * chuyện đó. Phần 15 sẽ thay ô này bằng việc gặp gỡ thật trong thế giới.
 */
function TeacherForm({ onSave }: { onSave: (blocked: string) => void }): ReactNode {
  const [open, setOpen] = useState(false);
  const [npcId, setNpcId] = useState('');
  const [name, setName] = useState('');
  const [skillId, setSkillId] = useState('skill_kiem-thuat');
  const [level, setLevel] = useState(80);
  const [quality, setQuality] = useState(3);
  const [priceKind, setPriceKind] = useState('money');
  const [amount, setAmount] = useState(0);
  const [detail, setDetail] = useState('');
  const [attitude, setAttitude] = useState(60);
  const [availability, setAvailability] = useState('');

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="self-start">
        Ghi lại một người thầy
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded border border-oak-light p-2">
      <TextInput placeholder="id, ví dụ npc_isolde" value={npcId} onChange={(event) => setNpcId(event.target.value)} />
      <TextInput placeholder="tên đọc được" value={name} onChange={(event) => setName(event.target.value)} />
      <Select value={skillId} onChange={(event) => setSkillId(event.target.value)}>
        {allSkills().map((skill) => (
          <option key={skill.id} value={skill.id}>
            {skill.name}
          </option>
        ))}
      </Select>
      <div className="flex gap-1.5">
        <TextInput
          type="number"
          min={0}
          max={95}
          value={level}
          onChange={(event) => setLevel(Number(event.target.value) || 0)}
          className="w-20"
        />
        <Select value={String(quality)} onChange={(event) => setQuality(Number(event.target.value))}>
          {[1, 2, 3, 4, 5].map((entry) => (
            <option key={entry} value={entry}>
              {teacherQuality(entry).name}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex gap-1.5">
        <Select value={priceKind} onChange={(event) => setPriceKind(event.target.value)}>
          {priceKinds().map((kind) => (
            <option key={kind.id} value={kind.id}>
              {kind.name}
            </option>
          ))}
        </Select>
        {priceKind === 'money' && (
          <TextInput
            type="number"
            min={0}
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value) || 0)}
            className="w-24"
          />
        )}
      </div>
      {priceKind !== 'money' && (
        <TextInput placeholder="cụ thể: thề cái gì, ân huệ gì" value={detail} onChange={(event) => setDetail(event.target.value)} />
      )}
      <TextInput placeholder="ở đâu, khi nào" value={availability} onChange={(event) => setAvailability(event.target.value)} />
      <label className="flex items-center gap-2 text-[0.65rem] text-vellum/50">
        Quan hệ
        <input
          type="range"
          min={-100}
          max={100}
          value={attitude}
          onChange={(event) => setAttitude(Number(event.target.value))}
          className="h-1 flex-1 accent-brass"
        />
        <span className="w-8 text-right font-mono text-parchment">{attitude}</span>
      </label>

      <div className="flex gap-1.5">
        <Button
          variant="primary"
          onClick={() => {
            const store = useGameStore.getState();
            const outcome = rememberTeacher(store.snapshot(), {
              npcId: npcId.trim(),
              name: name.trim() === '' ? npcId.trim() : name.trim(),
              skills: [{ skillId, level }],
              quality,
              attitude,
              attitudeRequired: 10,
              availability,
              price: { kind: priceKind, amount, detail },
            });
            if (outcome.blocked !== '') {
              onSave(outcome.blocked);
              return;
            }
            onSave(commit(outcome.ops));
            setOpen(false);
          }}
        >
          Ghi vào sổ
        </Button>
        <Button onClick={() => setOpen(false)}>Thôi</Button>
      </div>
    </div>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }): ReactNode {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-1 w-full overflow-hidden rounded bg-black/40">
      <div className="h-full bg-brass/70" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SkillsScreen({ onClose }: { onClose: () => void }): ReactNode {
  const state = useGameState();
  const [skillId, setSkillId] = useState('skill_kiem-thuat');
  const [message, setMessage] = useState('');

  const skills = skillsOf(state);
  const load = useMemo(() => slowBreakdown(state), [state]);
  const views = useMemo(() => graphOf(state, skillId), [state, skillId]);
  const report = capReport(state, skillId);
  const teacher = bestTeacherFor(state, skillId);

  if (skills === null) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink text-parchment">
        <p className="text-sm text-vellum/50 italic">Chưa có dữ liệu kỹ năng.</p>
      </div>
    );
  }

  const level = levelOf(state, skillId);
  const points = skills.practicePoints[skillId] ?? 0;
  const threshold = practiceThreshold(state, level, canTeach(teacher, skillId, level));

  return (
    <div className="fixed inset-0 z-50 flex bg-ink text-parchment">
      {/* --- Danh sách kỹ năng theo 10 nhóm --------------------------------- */}
      <aside className="flex w-96 shrink-0 flex-col border-r border-oak-light bg-oak">
        <div className="flex items-baseline justify-between border-b border-oak-light px-4 py-4">
          <div>
            <p className="text-xs tracking-[0.2em] text-brass uppercase">Kỹ năng</p>
            <p className="mt-1 text-xs text-vellum/40">
              {Math.round(skills.xp)} điểm KN chưa tiêu · {skills.unlockedNodes.length} nhánh đã mở
            </p>
          </div>
          <Button onClick={onClose}>Đóng</Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {skillGroups().map((group) => (
            <div key={group.id} className="border-b border-oak-light/60">
              <p className="px-4 pt-2 text-[0.6rem] tracking-widest text-vellum/40 uppercase">
                {groupName(group.id)}
              </p>
              {skillsInGroup(group.id).map((skill) => {
                const value = levelOf(state, skill.id);
                const cap = capReport(state, skill.id);
                const pool = skills.practicePoints[skill.id] ?? 0;
                const need = baseThreshold(value, false);
                const active = skill.id === skillId;
                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => setSkillId(skill.id)}
                    className={`flex w-full flex-col gap-0.5 px-4 py-1.5 text-left hover:bg-oak-light ${
                      active ? 'border-l-2 border-brass bg-oak-light' : 'border-l-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className={`flex-1 truncate text-sm ${active ? 'text-brass' : 'text-vellum'}`}>
                        {skill.name}
                      </span>
                      <span className="font-mono text-xs text-parchment">{value}</span>
                      <span className="w-20 shrink-0 text-right text-[0.6rem] text-vellum/40">
                        {tierName(value)}
                      </span>
                    </div>
                    <ProgressBar value={pool} max={need} />
                    <span className="text-[0.6rem] text-vellum/40">trần {cap.cap}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </aside>

      {/* --- Đồ thị nhánh ---------------------------------------------------- */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-5 py-4">
        <header className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-lg text-parchment">
              {skillsInGroup(skillGroups().find((group) => skillsInGroup(group.id).some((s) => s.id === skillId))?.id ?? '')
                .find((skill) => skill.id === skillId)?.name ?? skillId}
            </h2>
            <p className="text-xs text-vellum/50">
              {level} · {tierName(level)} · thực hành {Math.round(points * 10) / 10}/{threshold}
            </p>
          </div>
          <p className="max-w-md text-right text-xs text-amber-200/80">{report.reason}</p>
        </header>

        {message !== '' && <p className="mt-2 text-xs text-red-300">{message}</p>}

        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <SkillGraph
            views={views}
            activeStance={skills.activeStance[skillId] ?? ''}
            onUnlock={(nodeId) => {
              const outcome = unlockNode(state, nodeId);
              setMessage(outcome.blocked === '' ? commit(outcome.ops) : outcome.blocked);
            }}
            onStance={(nodeId) => {
              const outcome = setStance(state, skillId, nodeId);
              setMessage(outcome.blocked === '' ? commit(outcome.ops) : outcome.blocked);
            }}
          />
        </div>
      </main>

      {/* --- Tải học tập, thầy, nghĩa vụ ------------------------------------- */}
      <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-oak-light bg-oak px-4 py-4">
        <section className="flex flex-col gap-1">
          <p className="text-[0.6rem] tracking-widest text-brass uppercase">Tải học tập</p>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-vellum/60">Đang gánh</span>
            <span className="font-mono text-parchment">{load.load}</span>
          </div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-vellum/60">Hệ số chậm</span>
            <span className={`font-mono ${load.heavy ? 'text-amber-300' : 'text-parchment'}`}>×{load.factor}</span>
          </div>
          <p className="text-[0.65rem] text-vellum/40">
            nhánh + kỹ năng thành thạo ×{load.loadFactor} · tuổi ×{load.ageFactor} · chủng tộc ×{load.raceFactor}
          </p>
          {load.heavy && (
            <p className="rounded border-l-2 border-amber-500 bg-amber-500/10 px-2 py-1 text-[0.68rem] text-amber-200">
              Ngài đang ôm quá nhiều thứ cùng lúc. Mỗi giờ luyện tập bây giờ chỉ còn giá trị bằng
              {` ${Math.round((1 / load.factor) * 100)}%`} so với một người chuyên một nghề.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-1 border-t border-oak-light pt-2">
          <p className="text-[0.6rem] tracking-widest text-brass uppercase">Thầy đã biết</p>
          {Object.values(skills.teachers).length === 0 ? (
            <p className="text-xs text-vellum/40 italic">
              Chưa biết người thầy nào. Hỏi thăm, lần theo tin đồn, hoặc để danh vọng tự mời họ tới.
            </p>
          ) : (
            Object.values(skills.teachers).map((entry) => {
              const quality = teacherQuality(entry.quality);
              const price = priceKindOf(entry.price.kind);
              const plan = planStudy(state, entry.npcId, skillId);
              return (
                <div key={entry.npcId} className="rounded border border-oak-light px-2 py-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs text-parchment">{entry.name}</span>
                    <span className="text-[0.6rem] text-vellum/40">{quality.name}</span>
                  </div>
                  <p className="text-[0.65rem] text-vellum/50">
                    {entry.skills
                      .map((row) => `${row.skillId.replace(/^skill_/u, '')} ${row.level}`)
                      .join(' · ')}
                  </p>
                  {entry.availability !== '' && (
                    <p className="text-[0.62rem] text-vellum/40">{entry.availability}</p>
                  )}
                  <p className="text-[0.62rem] text-vellum/40">
                    Giá: {price?.name ?? entry.price.kind}
                    {entry.price.amount > 0 && ` ${entry.price.amount} đồng`}
                    {entry.price.detail !== '' && ` — ${entry.price.detail}`}
                  </p>
                  <p className="text-[0.62rem] text-vellum/40">
                    Quan hệ {entry.attitude}/100
                    {entry.attitude < entry.attitudeRequired && ' · chưa đủ thân để nhận trò'}
                  </p>

                  {/* Xem trước NGUYÊN cái giá trước khi thề bất cứ điều gì:
                      mấy điểm, mấy ngày, và trả bằng gì. Mục 8 gọi thời gian là
                      chi phí cơ hội quan trọng nhất, nên nó phải hiện trước. */}
                  {plan.blocked === '' ? (
                    <div className="mt-1 flex flex-col gap-1">
                      <p className="text-[0.62rem] text-vellum/60">
                        Học {skillName(skillId)}: +{plan.levels} điểm · {plan.days} ngày · xong {plan.endsOn}
                        {plan.holdingBack && ' · thầy còn giấu nghề'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setMessage(commit(beginStudy(state, plan, state.meta.turn).ops))}
                        className="self-start rounded border border-brass px-2 py-0.5 text-[0.65rem] text-brass hover:bg-brass/10"
                      >
                        Xin theo học
                      </button>
                    </div>
                  ) : (
                    <p className="mt-1 text-[0.62rem] text-vellum/40 italic">{plan.blocked}</p>
                  )}
                </div>
              );
            })
          )}
          <TeacherForm onSave={setMessage} />
        </section>

        {skills.study !== null && (
          <section className="flex flex-col gap-1 border-t border-oak-light pt-2">
            <p className="text-[0.6rem] tracking-widest text-brass uppercase">Đang theo học</p>
            <p className="text-xs text-vellum/70">
              {skills.teachers[skills.study.teacherId]?.name ?? skills.study.teacherId} ·{' '}
              {skills.study.days} ngày · mọi việc khác đều bị phạt trong lúc này.
            </p>
          </section>
        )}

        <section className="flex flex-col gap-1 border-t border-oak-light pt-2">
          <p className="text-[0.6rem] tracking-widest text-brass uppercase">Đang nợ thầy</p>
          {skills.obligations.filter((entry) => !entry.settled).length === 0 ? (
            <p className="text-xs text-vellum/40 italic">Không nợ ai điều gì.</p>
          ) : (
            skills.obligations
              .filter((entry) => !entry.settled)
              .map((entry) => (
                <div key={entry.id} className="rounded border border-blood/40 bg-blood/5 px-2 py-1">
                  <p className="text-[0.68rem] text-vellum/80">
                    {priceKindOf(entry.kind)?.name ?? entry.kind}: {entry.detail}
                  </p>
                  <p className="text-[0.62rem] text-vellum/40">
                    nợ {skills.teachers[entry.teacherId]?.name ?? entry.teacherId} ·{' '}
                    {entry.dueDate === '' ? 'không có hạn — đòi lúc nào thì tùy họ' : `hạn ${entry.dueDate}`}
                  </p>
                </div>
              ))
          )}
        </section>
      </aside>
    </div>
  );
}
