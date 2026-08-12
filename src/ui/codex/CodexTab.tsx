import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { codexOf, type CodexCollection, type NpcCodexEntry } from '@/systems/codex';
import { applyPatch } from '@/state/mvu';
import { useGameStore } from '@/state/store';
import { PortraitImage, PortraitPicker } from '@/ui/portrait';
import { LoreEntryReader } from '@/ui/lore/LoreEntryReader';
import { TextInput } from '@/ui/settings/controls';

const COLLECTIONS: Array<{ id: CodexCollection; label: string }> = [
  { id: 'npcs', label: 'NPC' },
  { id: 'locations', label: 'Địa danh' },
  { id: 'events', label: 'Sự kiện' },
  { id: 'organizations', label: 'Tổ chức' },
  { id: 'objects', label: 'Vật phẩm' },
  { id: 'quests', label: 'Nhiệm vụ' },
  { id: 'other', label: 'Khác' },
];

interface BaseEntry {
  id: string;
  name: string;
  aliases: string[];
  summary: string;
  tags: string[];
  firstSeenTurn: number;
  lastSeenTurn: number;
  lastUpdatedTurn: number;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(hasValue);
  return true;
}

function show(value: unknown): string {
  if (Array.isArray(value)) return value.join(' · ');
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => hasValue(child))
      .map(([key, child]) => `${key}: ${show(child)}`)
      .join('\n');
  }
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  return String(value);
}

function Field({ label, value }: { label: string; value: unknown }): ReactNode {
  if (!hasValue(value)) return null;
  return (
    <div className="grid gap-1 border-b border-oak-light/40 py-1.5 sm:grid-cols-[9rem_1fr]">
      <dt className="text-xs text-vellum/45">{label}</dt>
      <dd className="text-xs whitespace-pre-wrap text-parchment">{show(value)}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section className="rounded border border-oak-light bg-ink/45 p-3">
      <h4 className="mb-1 text-xs tracking-[0.18em] text-brass uppercase">{title}</h4>
      <dl>{children}</dl>
    </section>
  );
}

function RelationshipDetail({ npc }: { npc: NpcCodexEntry }): ReactNode {
  const relationships = Object.entries(npc.relationships);
  return (
    <section className="rounded border border-oak-light bg-ink/45 p-3">
      <h4 className="mb-2 text-xs tracking-[0.18em] text-brass uppercase">Hảo cảm & mối quan hệ</h4>
      {relationships.length === 0 ? (
        <p className="text-xs text-vellum/40 italic">Chưa ghi nhận mối quan hệ nào.</p>
      ) : relationships.map(([targetId, relation]) => (
        <article key={targetId} className="mb-2 rounded border border-oak-light/60 bg-oak/30 p-2 last:mb-0">
          <p className="text-sm text-parchment">{relation.type || 'Quan hệ chưa phân loại'}</p>
          <p className="font-mono text-[10px] text-vellum/35">với {relation.targetId || targetId}</p>
          <dl className="mt-1 grid grid-cols-2 gap-x-3 xl:grid-cols-5">
            <Field label="Hảo cảm" value={relation.affection} />
            <Field label="Tin tưởng" value={relation.trust} />
            <Field label="Tôn trọng" value={relation.respect} />
            <Field label="Sợ hãi" value={relation.fear} />
            <Field label="Hấp dẫn" value={relation.attraction} />
          </dl>
          <dl>
            <Field label="Trạng thái" value={relation.status} />
            <Field label="Hai chiều" value={relation.mutual} />
            <Field label="Từ lượt" value={relation.sinceTurn} />
            <Field label="Cập nhật lượt" value={relation.lastUpdatedTurn} />
            <Field label="Ghi chú" value={relation.notes} />
            <Field label="Lịch sử thay đổi" value={relation.history} />
          </dl>
        </article>
      ))}
    </section>
  );
}

function NpcDetail({ npc }: { npc: NpcCodexEntry }): ReactNode {
  return (
    <div className="flex flex-col gap-3">
      <Section title="Danh tính">
        <Field label="Vai trò" value={npc.role} />
        <Field label="Quan hệ gia đình" value={npc.familyRelation} />
        <Field label="Gia tộc" value={npc.houseId} />
        <Field label="Hồ sơ lore" value={npc.loreEntry} />
        <Field label="Còn sống" value={npc.alive} />
        <Field label="Tình trạng" value={npc.status} />
        <Field label="Tuổi" value={npc.age} />
        <Field label="Giới tính sinh học" value={npc.sex} />
        <Field label="Bản dạng giới" value={npc.gender} />
        <Field label="Loài" value={npc.species} />
        <Field label="Chủng tộc" value={npc.race} />
        <Field label="Đã xác nhận 18+" value={npc.adultConfirmed} />
      </Section>

      {npc.loreEntry !== '' && <LoreEntryReader key={npc.loreEntry} entryId={npc.loreEntry} />}

      <Section title="Ngoại hình & thông số cơ thể">
        <Field label="Tổng quan" value={npc.appearance.overview} />
        <Field label="Dáng người" value={npc.appearance.build} />
        <Field label="Da" value={npc.appearance.skin} />
        <Field label="Tóc" value={npc.appearance.hair} />
        <Field label="Mắt" value={npc.appearance.eyes} />
        <Field label="Khuôn mặt" value={npc.appearance.face} />
        <Field label="Giọng nói" value={npc.appearance.voice} />
        <Field label="Dáng đi" value={npc.appearance.gait} />
        <Field label="Trang phục" value={npc.appearance.clothing} />
        <Field label="Đặc điểm nhận diện" value={npc.appearance.distinguishingFeatures} />
        <Field label="Sẹo & dấu vết" value={npc.appearance.scarsAndMarks} />
        <Field label="Số đo" value={npc.appearance.measurements} />
      </Section>

      <Section title="Tính cách">
        <Field label="Nét tính cách" value={npc.personality.traits} />
        <Field label="Khí chất" value={npc.personality.temperament} />
        <Field label="Giá trị" value={npc.personality.values} />
        <Field label="Nỗi sợ" value={npc.personality.fears} />
        <Field label="Mục tiêu" value={npc.personality.goals} />
        <Field label="Thói quen" value={npc.personality.habits} />
        <Field label="Cách nói" value={npc.personality.speechStyle} />
        <Field label="Thích" value={npc.personality.likes} />
        <Field label="Không thích" value={npc.personality.dislikes} />
      </Section>

      <Section title="Lý lịch & quan hệ">
        <Field label="Xuất thân" value={npc.background.origin} />
        <Field label="Nơi ở" value={npc.background.residence} />
        <Field label="Nghề nghiệp" value={npc.background.occupation} />
        <Field label="Học vấn" value={npc.background.education} />
        <Field label="Gia đình" value={npc.background.family} />
        <Field label="Tổ chức" value={npc.background.affiliations} />
        <Field label="Lịch sử" value={npc.background.history} />
        <Field label="Bí mật đã biết" value={npc.background.knownSecrets} />
        <Field label="Động cơ" value={npc.background.motivations} />
        <Field label="Ghi chú" value={npc.background.notes} />
        <Field label="Chỉ số" value={npc.statistics} />
        <Field label="Các lần gặp" value={npc.encounters} />
      </Section>

      <RelationshipDetail npc={npc} />

      <section className="rounded border border-rose-900/70 bg-rose-950/15 p-3">
        <h4 className="text-xs tracking-[0.18em] text-rose-300 uppercase">Thông tin cơ thể trưởng thành · 18+</h4>
        {npc.adultDetail === null ? (
          <p className="mt-2 text-xs text-vellum/45">
            Chưa có dữ liệu. Game chỉ nhận mục này khi tuổi từ 18 trở lên và trạng thái trưởng thành đã được xác nhận.
          </p>
        ) : (
          <dl className="mt-1">
            <Field label="Vùng ngực" value={npc.adultDetail.chest} />
            <Field label="Lông cơ thể" value={npc.adultDetail.bodyHair} />
            <Field label="Giải phẫu riêng tư" value={npc.adultDetail.intimateAnatomy} />
            <Field label="Lịch sử sinh sản" value={npc.adultDetail.reproductiveHistory} />
            <Field label="Ghi chú" value={npc.adultDetail.notes} />
          </dl>
        )}
      </section>
    </div>
  );
}

function GenericDetail({ entry }: { entry: BaseEntry & Record<string, unknown> }): ReactNode {
  const hidden = new Set(['id', 'name', 'aliases', 'summary', 'tags', 'firstSeenTurn', 'lastSeenTurn', 'lastUpdatedTurn', 'sources']);
  return (
    <Section title="Thông tin chi tiết">
      {Object.entries(entry)
        .filter(([key, value]) => !hidden.has(key) && hasValue(value))
        .map(([key, value]) => <Field key={key} label={key} value={value} />)}
    </Section>
  );
}

export function CodexTab(): ReactNode {
  const game = useGameStore();
  const codex = useMemo(() => codexOf(game.snapshot()), [game]);
  const [collection, setCollection] = useState<CodexCollection>('npcs');
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [portraitError, setPortraitError] = useState('');

  const records = useMemo(() => Object.values(codex[collection]) as BaseEntry[], [codex, collection]);
  const filtered = useMemo(() => {
    const term = filter.trim().toLocaleLowerCase('vi-VN');
    return [...records]
      .filter((entry) => term === '' || [entry.id, entry.name, ...entry.aliases, ...entry.tags]
        .some((value) => value.toLocaleLowerCase('vi-VN').includes(term)))
      .sort((a, b) => b.lastUpdatedTurn - a.lastUpdatedTurn || a.name.localeCompare(b.name, 'vi'));
  }, [filter, records]);

  useEffect(() => {
    if (selectedId !== null && filtered.some((entry) => entry.id === selectedId)) return;
    setSelectedId(filtered[0]?.id ?? null);
  }, [collection, filtered, selectedId]);

  const selected = selectedId === null
    ? null
    : codex[collection][selectedId] as (BaseEntry & Record<string, unknown>) | undefined;

  const selectedNpc = collection === 'npcs' && selected !== null && selected !== undefined
    ? selected as unknown as NpcCodexEntry
    : null;

  const updateNpcPortrait = (portrait: string): void => {
    if (selectedNpc === null) return;
    const store = useGameStore.getState();
    const snapshot = store.snapshot();
    const current = codexOf(snapshot).npcs[selectedNpc.id];
    if (current === undefined) return;
    const applied = applyPatch(snapshot, [{
      op: 'set',
      path: `codex.npcs.${current.id}`,
      from: current,
      to: { ...current, portrait },
      reason: portrait === '' ? 'người chơi xóa ảnh hồ sơ Codex' : 'người chơi chọn ảnh hồ sơ Codex',
      source: 'json',
    }], { actor: 'engine' });
    if (!applied.applied || applied.next === null) {
      setPortraitError(applied.failures[0]?.message ?? 'Không thể lưu ảnh vào hồ sơ này.');
      return;
    }
    store.commitBatch(applied.next);
    setPortraitError('');
  };

  return (
    <div className="flex min-h-[32rem] flex-col gap-3">
      <div>
        <p className="text-sm text-parchment">Codex của ván chơi</p>
        <p className="text-xs text-vellum/45">
          AI tạo và cập nhật sau từng lượt. Toàn bộ hồ sơ được lưu chung với file save và tự nạp lại sau F5.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {COLLECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => { setCollection(item.id); setSelectedId(null); }}
            className={`rounded border px-2 py-1 text-xs ${collection === item.id
              ? 'border-brass bg-brass/15 text-brass'
              : 'border-oak-light text-vellum/55 hover:bg-oak-light'}`}
          >
            {item.label} · {Object.keys(codex[item.id]).length}
          </button>
        ))}
      </div>

      <TextInput
        value={filter}
        placeholder="Tìm theo tên, ID, bí danh hoặc thẻ…"
        onChange={(event) => setFilter(event.target.value)}
      />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="max-h-[58vh] overflow-y-auto rounded border border-oak-light bg-ink/45 p-2">
          {filtered.length === 0 && <p className="p-3 text-xs text-vellum/40 italic">Chưa có hồ sơ trong nhóm này.</p>}
          {filtered.map((entry) => {
            const npc = collection === 'npcs' ? entry as unknown as NpcCodexEntry : null;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => { setSelectedId(entry.id); setPortraitError(''); }}
                className={`mb-1 flex w-full items-center gap-2 rounded border px-2 py-2 text-left ${selectedId === entry.id
                  ? 'border-brass/60 bg-brass/10'
                  : 'border-transparent hover:border-oak-light hover:bg-oak-light/50'}`}
              >
                {npc !== null && (
                  <PortraitImage value={npc.portrait} alt={`Ảnh ${entry.name}`} className="h-12 w-10 shrink-0" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-parchment">{entry.name}</span>
                  <span className="block truncate font-mono text-[10px] text-vellum/35">{entry.id}</span>
                  <span className="block text-[10px] text-vellum/35">cập nhật lượt {entry.lastUpdatedTurn}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="max-h-[58vh] overflow-y-auto pr-1">
          {selected === null || selected === undefined ? (
            <div className="rounded border border-oak-light p-6 text-center text-xs text-vellum/40 italic">
              Chọn một hồ sơ để xem chi tiết.
            </div>
          ) : (
            <article className="flex flex-col gap-3">
              <header className="rounded border border-oak-light bg-oak/55 p-3">
                <div className="flex items-start gap-3">
                  {selectedNpc !== null && (
                    <div className="shrink-0">
                      <PortraitPicker
                        value={selectedNpc.portrait}
                        alt={`Ảnh ${selectedNpc.name}`}
                        compact
                        onChange={updateNpcPortrait}
                      />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg text-brass">{selected.name}</h3>
                    <p className="font-mono text-[10px] text-vellum/35">{selected.id}</p>
                    {selected.aliases.length > 0 && <p className="mt-1 text-xs text-vellum/55">Bí danh: {selected.aliases.join(' · ')}</p>}
                    {selected.summary !== '' && <p className="mt-2 text-sm text-parchment">{selected.summary}</p>}
                    <p className="mt-2 text-[10px] text-vellum/35">
                      Gặp lần đầu: lượt {selected.firstSeenTurn} · gần nhất: lượt {selected.lastSeenTurn} · cập nhật: lượt {selected.lastUpdatedTurn}
                    </p>
                    {portraitError !== '' && <p className="mt-2 text-xs text-red-300">{portraitError}</p>}
                  </div>
                </div>
              </header>

              {collection === 'npcs'
                ? <NpcDetail npc={selected as unknown as NpcCodexEntry} />
                : <GenericDetail entry={selected} />}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
