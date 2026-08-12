/**
 * Cột phải — form sửa entry, đủ các field của Phần 4 mục 2.
 *
 * `variants` và `triggers` sửa bằng JSON chứ không bằng form: chúng là mảng
 * lồng nhau, và một form dựng cho chúng sẽ chiếm nửa màn hình để phục vụ hai
 * field mà phần lớn entry không dùng. JSON có Zod gác ở nút Lưu, nên sai là
 * biết ngay chứ không lặng lẽ mất dữ liệu.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { allRegions } from '@/lore/regions';
import { loreEntrySchema, loreEntryTypes, type LoreEntry } from '@/lore/types';
import { Button, Field, Select, TextInput, Warning } from '@/ui/settings/controls';

function listToText(list: readonly string[] | undefined): string {
  return (list ?? []).join(', ');
}

function textToList(text: string): string[] {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

function dateToText(date: LoreEntry['validFrom']): string {
  return date === undefined ? '' : `${date.day}/${date.month}/${date.year}`;
}

function textToDate(text: string): LoreEntry['validFrom'] {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{1,4})$/.exec(text.trim());
  if (match === null) return undefined;
  return {
    day: Number(match[1]),
    month: Number(match[2]),
    year: Number(match[3]),
    hour: 0,
  };
}

interface Draft {
  entry: LoreEntry;
  keysText: string;
  secondaryText: string;
  regionsText: string;
  requiresText: string;
  relatedText: string;
  variantsText: string;
  triggersText: string;
  fromText: string;
  untilText: string;
}

function toDraft(entry: LoreEntry): Draft {
  return {
    entry,
    keysText: listToText(entry.keys),
    secondaryText: listToText(entry.keysSecondary?.keys),
    regionsText: listToText(entry.regions),
    requiresText: listToText(entry.requiresKnowledge),
    relatedText: (entry.related ?? []).map((item) => `${item.id}:${item.pullWeight}`).join(', '),
    variantsText: entry.variants === undefined ? '' : JSON.stringify(entry.variants, null, 2),
    triggersText: entry.triggers === undefined ? '' : JSON.stringify(entry.triggers, null, 2),
    fromText: dateToText(entry.validFrom),
    untilText: dateToText(entry.validUntil),
  };
}

export function EntryForm({
  entry,
  onSave,
  onDelete,
  onDuplicate,
}: {
  entry: LoreEntry;
  onSave(next: LoreEntry): void;
  onDelete(): void;
  onDuplicate(): void;
}): ReactNode {
  const [draft, setDraft] = useState<Draft>(() => toDraft(entry));
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => setDraft(toDraft(entry)), [entry]);

  const patch = (change: Partial<LoreEntry>): void => {
    setDraft((previous) => ({ ...previous, entry: { ...previous.entry, ...change } }));
  };

  const save = (): void => {
    const issues: string[] = [];

    const parseJson = <T,>(text: string, label: string): T | undefined => {
      if (text.trim() === '') return undefined;
      try {
        return JSON.parse(text) as T;
      } catch (error) {
        issues.push(`${label}: ${String(error)}`);
        return undefined;
      }
    };

    const related = draft.relatedText.trim() === ''
      ? undefined
      : textToList(draft.relatedText).map((pair) => {
          const [id, weight] = pair.split(':');
          return { id: (id ?? '').trim(), pullWeight: Number(weight ?? 1) };
        });

    const candidate: Record<string, unknown> = {
      ...draft.entry,
      keys: textToList(draft.keysText),
      regions: draft.regionsText.trim() === '' ? undefined : textToList(draft.regionsText),
      requiresKnowledge: draft.requiresText.trim() === '' ? undefined : textToList(draft.requiresText),
      keysSecondary:
        draft.secondaryText.trim() === ''
          ? undefined
          : { logic: draft.entry.keysSecondary?.logic ?? 'AND_ANY', keys: textToList(draft.secondaryText) },
      related,
      variants: parseJson(draft.variantsText, 'variants'),
      triggers: parseJson(draft.triggersText, 'triggers'),
      validFrom: textToDate(draft.fromText),
      validUntil: textToDate(draft.untilText),
    };

    if (draft.fromText.trim() !== '' && candidate['validFrom'] === undefined) {
      issues.push('validFrom: viết theo dạng ngày/tháng/năm, ví dụ 1/6/1444');
    }
    if (draft.untilText.trim() !== '' && candidate['validUntil'] === undefined) {
      issues.push('validUntil: viết theo dạng ngày/tháng/năm');
    }

    const parsed = loreEntrySchema.safeParse(candidate);
    if (!parsed.success) {
      issues.push(...parsed.error.issues.map((issue) => `${issue.path.join('.') || '(gốc)'}: ${issue.message}`));
    }
    if (issues.length > 0) {
      setErrors(issues);
      return;
    }

    setErrors([]);
    if (parsed.success) onSave(parsed.data);
  };

  const value = draft.entry;

  return (
    <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1 text-xs">
      <div className="flex items-center gap-2">
        <code className="text-vellum/40">{value.id}</code>
        <div className="flex-1" />
        <Button onClick={onDuplicate}>Nhân bản</Button>
        <Button variant="danger" onClick={onDelete}>
          Xóa
        </Button>
        <Button variant="primary" onClick={save}>
          Lưu
        </Button>
      </div>

      {errors.length > 0 && (
        <Warning level="warn">
          {errors.map((line, index) => (
            <span key={index} className="block">
              {line}
            </span>
          ))}
        </Warning>
      )}

      <Field label="Tiêu đề">
        <TextInput value={value.title} onChange={(event) => patch({ title: event.target.value })} />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Loại">
          <Select value={value.type} onChange={(event) => patch({ type: event.target.value as LoreEntry['type'] })}>
            {loreEntryTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cổng tri thức" hint="secret không bao giờ vào prompt chính">
          <Select
            value={value.knowledge}
            onChange={(event) => patch({ knowledge: event.target.value as LoreEntry['knowledge'] })}
          >
            <option value="public">public</option>
            <option value="gated">gated</option>
            <option value="secret">secret</option>
          </Select>
        </Field>
      </div>

      {value.knowledge === 'gated' && (
        <Field label="Đòi tri thức" hint="id, ngăn bằng dấu phẩy">
          <TextInput
            value={draft.requiresText}
            onChange={(event) => setDraft({ ...draft, requiresText: event.target.value })}
          />
        </Field>
      )}

      <Field label="Nội dung" hint="EJS render được, dùng locals của Phần 3">
        <textarea
          rows={8}
          value={value.content}
          onChange={(event) => patch({ content: event.target.value })}
          className="w-full resize-y rounded border border-oak-light bg-ink px-2 py-1.5 text-xs text-parchment"
        />
      </Field>

      <Field label="Tóm tắt" hint="dùng khi hết ngân sách, thay vì bỏ hẳn entry">
        <textarea
          rows={2}
          value={value.summary ?? ''}
          onChange={(event) => patch({ summary: event.target.value })}
          className="w-full resize-y rounded border border-oak-light bg-ink px-2 py-1.5 text-xs text-parchment"
        />
      </Field>

      <p className="mt-1 tracking-[0.2em] text-brass uppercase">Lớp 1 · từ khóa</p>
      <Field label="Từ khóa" hint="ngăn bằng dấu phẩy">
        <TextInput value={draft.keysText} onChange={(event) => setDraft({ ...draft, keysText: event.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Từ khóa phụ">
          <TextInput
            value={draft.secondaryText}
            onChange={(event) => setDraft({ ...draft, secondaryText: event.target.value })}
          />
        </Field>
        <Field label="Logic từ khóa phụ">
          <Select
            value={value.keysSecondary?.logic ?? 'AND_ANY'}
            onChange={(event) =>
              patch({
                keysSecondary: {
                  logic: event.target.value as NonNullable<LoreEntry['keysSecondary']>['logic'],
                  keys: textToList(draft.secondaryText),
                },
              })
            }
          >
            <option value="AND_ANY">AND_ANY</option>
            <option value="AND_ALL">AND_ALL</option>
            <option value="NOT_ANY">NOT_ANY</option>
            <option value="NOT_ALL">NOT_ALL</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Chế độ khớp">
          <Select
            value={value.matchMode}
            onChange={(event) => patch({ matchMode: event.target.value as LoreEntry['matchMode'] })}
          >
            <option value="plain">plain</option>
            <option value="wholeWord">wholeWord</option>
            <option value="regex">regex</option>
          </Select>
        </Field>
        <label className="flex items-end gap-2 pb-2">
          <input
            type="checkbox"
            checked={value.caseSensitive}
            onChange={(event) => patch({ caseSensitive: event.target.checked })}
          />
          <span className="text-vellum/70">Phân biệt hoa thường</span>
        </label>
        <label className="flex items-end gap-2 pb-2">
          <input
            type="checkbox"
            checked={value.constant}
            onChange={(event) => patch({ constant: event.target.checked })}
          />
          <span className="text-vellum/70">Luôn chèn</span>
        </label>
      </div>

      <p className="mt-1 tracking-[0.2em] text-brass uppercase">Lớp 2–4 · thời gian, vùng, điều kiện</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Có hiệu lực từ" hint="ngày/tháng/năm">
          <TextInput
            value={draft.fromText}
            placeholder="1/6/1444"
            onChange={(event) => setDraft({ ...draft, fromText: event.target.value })}
          />
        </Field>
        <Field label="Tới">
          <TextInput
            value={draft.untilText}
            onChange={(event) => setDraft({ ...draft, untilText: event.target.value })}
          />
        </Field>
      </div>
      <Field label="Vùng" hint={`id vùng, ngăn bằng phẩy · có sẵn: ${allRegions().length} vùng`}>
        <TextInput
          value={draft.regionsText}
          placeholder="prov_swabia, hold_brogg"
          onChange={(event) => setDraft({ ...draft, regionsText: event.target.value })}
        />
      </Field>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.includeAdjacent}
          onChange={(event) => patch({ includeAdjacent: event.target.checked })}
        />
        <span className="text-vellum/70">Tính cả vùng kề</span>
      </label>
      <Field label="Điều kiện (EJS)" hint="trả về boolean; hỏng thì coi như sai">
        <TextInput
          value={value.condition ?? ''}
          placeholder="q.rumors().length > 0"
          onChange={(event) => patch({ condition: event.target.value })}
        />
      </Field>

      <p className="mt-1 tracking-[0.2em] text-brass uppercase">Chèn</p>
      <div className="grid grid-cols-4 gap-2">
        <Field label="Vị trí">
          <Select
            value={value.placement === 'block' ? 'block' : 'depth'}
            onChange={(event) => patch({ placement: event.target.value === 'block' ? 'block' : { depth: 2 } })}
          >
            <option value="block">khối 4</option>
            <option value="depth">theo độ sâu</option>
          </Select>
        </Field>
        <Field label="Độ sâu">
          <TextInput
            type="number"
            min={0}
            disabled={value.placement === 'block'}
            value={value.placement === 'block' ? '' : value.placement.depth}
            onChange={(event) => patch({ placement: { depth: Math.max(0, Number(event.target.value)) } })}
          />
        </Field>
        <Field label="Trọng số">
          <TextInput
            type="number"
            value={value.weight}
            onChange={(event) => patch({ weight: Number(event.target.value) })}
          />
        </Field>
        <Field label="Ưu tiên ngân sách">
          <TextInput
            type="number"
            min={1}
            max={10}
            value={value.budgetPriority}
            onChange={(event) => patch({ budgetPriority: Math.max(1, Math.min(10, Number(event.target.value))) })}
          />
        </Field>
      </div>

      <p className="mt-1 tracking-[0.2em] text-brass uppercase">Hành vi</p>
      <div className="grid grid-cols-4 gap-2">
        <Field label="Sticky" hint="giữ N lượt">
          <TextInput
            type="number"
            min={0}
            value={value.sticky ?? ''}
            onChange={(event) => patch({ sticky: event.target.value === '' ? undefined : Number(event.target.value) })}
          />
        </Field>
        <Field label="Cooldown">
          <TextInput
            type="number"
            min={0}
            value={value.cooldown ?? ''}
            onChange={(event) => patch({ cooldown: event.target.value === '' ? undefined : Number(event.target.value) })}
          />
        </Field>
        <Field label="Delay">
          <TextInput
            type="number"
            min={0}
            value={value.delay ?? ''}
            onChange={(event) => patch({ delay: event.target.value === '' ? undefined : Number(event.target.value) })}
          />
        </Field>
        <Field label="Xác suất" hint="0–100, seeded">
          <TextInput
            type="number"
            min={0}
            max={100}
            value={value.probability ?? ''}
            onChange={(event) =>
              patch({ probability: event.target.value === '' ? undefined : Number(event.target.value) })
            }
          />
        </Field>
      </div>

      <p className="mt-1 tracking-[0.2em] text-brass uppercase">Quan hệ và đệ quy</p>
      <Field label="Kéo theo" hint="id:trọng số, ví dụ ba-tuoc-reinhard:0.8">
        <TextInput
          value={draft.relatedText}
          onChange={(event) => setDraft({ ...draft, relatedText: event.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={value.recurse} onChange={(event) => patch({ recurse: event.target.checked })} />
          <span className="text-vellum/70">Quét lại nội dung (recurse)</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.preventRecursion}
            onChange={(event) => patch({ preventRecursion: event.target.checked })}
          />
          <span className="text-vellum/70">Chỉ kích từ tin nhắn gốc</span>
        </label>
      </div>

      <p className="mt-1 tracking-[0.2em] text-brass uppercase">Biến thể và trigger (JSON)</p>
      <Field label="variants" hint='[{ "audience": "nation_hre", "content": "…" }] — id trong nations.json / races.json'>
        <textarea
          rows={4}
          value={draft.variantsText}
          onChange={(event) => setDraft({ ...draft, variantsText: event.target.value })}
          className="w-full resize-y rounded border border-oak-light bg-ink px-2 py-1.5 font-mono text-[11px] text-parchment"
        />
      </Field>
      <Field label="triggers" hint='[{ "when": "onActivate", "emit": { "event": "lore.notify", "payload": {} } }]'>
        <textarea
          rows={4}
          value={draft.triggersText}
          onChange={(event) => setDraft({ ...draft, triggersText: event.target.value })}
          className="w-full resize-y rounded border border-oak-light bg-ink px-2 py-1.5 font-mono text-[11px] text-parchment"
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.triggerOnce}
            onChange={(event) => patch({ triggerOnce: event.target.checked })}
          />
          <span className="text-vellum/70">Chỉ bắn một lần</span>
        </label>
        <Field label="Nghỉ giữa hai lần bắn">
          <TextInput
            type="number"
            min={0}
            value={value.triggerCooldown ?? ''}
            onChange={(event) =>
              patch({ triggerCooldown: event.target.value === '' ? undefined : Number(event.target.value) })
            }
          />
        </Field>
      </div>
    </div>
  );
}
