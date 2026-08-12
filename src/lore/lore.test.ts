/**
 * Bài test của Phần 4.
 *
 * Bài bắt buộc của mục 13.10 nằm ở nhóm "lớp L3": ĐỨNG Ở VÙNG A THÌ ENTRY CỦA
 * VÙNG B KHÔNG ĐƯỢC CHÈN, DÙ KHỚP TỪ KHÓA. Nó được viết thành hai ca tách hẳn
 * nhau, vì có hai đường chặn khác nhau và một cái có thể che lấp cái kia:
 * sách của vùng B tự tắt ở L1, còn entry vùng B nằm trong sách toàn cục thì
 * phải bị L3 chặn. Chỉ test ca đầu là bỏ lọt cả lớp L3.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import { createMacroContext } from '@/ai/macros';
import { events } from '@/core/eventbus';
import nationsFile from '@data/nations.json';
import racesFile from '@data/races.json';
import { registerGameSlices } from '@/state/register';
import { applyPatch } from '@/state/mvu';
import { slices, type GameState } from '@/state/slices';
import { createInitialState } from '@/state/store';
import { seedBooks, parseLoreFile, duplicateIds } from './lorebook';
import { convertWorldInfo, looksLikeWorldInfo } from './convert-st';
import { checkGate, knowledgeOf, gainKnowledgeOp, knowledgeSlice } from './knowledge';
import { allRegions, isAdjacent, isWithin, matchesRegions } from './regions';
import { bookActivation, matchKeys, scanLore, type ScanInput } from './scanner';
import { selectWithinBudget } from './budget';
import { runLorePass } from './pass';
import { fireTriggers, registerLoreHandlers, LORE_EVENTS, MAX_LORE_EVENTS_PER_TURN } from './triggers';
import { loreEntrySchema, lorebookSchema, type Lorebook } from './types';

const EHRENFELD = 'hold_ehrenfeld';
const TROYES = 'hold_troyes';

function freshState(regionId = EHRENFELD): GameState {
  if (slices.get('character') === undefined) registerGameSlices();
  const state = createInitialState('hat-giong-lore', 'Aldric');
  (state['knowledge'] as { regionId: string }).regionId = regionId;
  return state;
}

/**
 * Sách DỰNG SẴN của bài test, tách khỏi sách nội dung của chiến dịch.
 *
 * `seedBooks()` nạp MỌI file trong `/lorebooks`, kể cả sách người viết nội dung
 * vừa bỏ vào. Nhóm "cổng gác cho nội dung tự viết" ở trên cần đúng như thế — nó
 * gác nội dung thật. Nhưng các bài kiểm cơ chế bên dưới thì không: chúng neo
 * vào id cụ thể (`giao-hoi`, `dich-hach`) và vào thứ tự entry, nên mỗi lần thêm
 * một sách mới là chúng đỏ vì một lý do không liên quan gì tới cơ chế.
 *
 * Lọc lại còn ba sách mẫu + kho ví dụ, và bài test đứng yên trong khi kho nội
 * dung lớn lên.
 */
const SACH_MAU = new Set(['book-khung-mau', 'book-chung', 'book-swabia', 'book-champagne']);

function books(): Lorebook[] {
  return seedBooks().books.filter((book) => SACH_MAU.has(book.id));
}

function scan(over: Partial<ScanInput> = {}) {
  const state = over.state ?? freshState();
  return scanLore({
    books: books(),
    state,
    turn: 5,
    now: state.meta.gameDate,
    regionId: (state['knowledge'] as { regionId: string }).regionId,
    texts: [{ text: '', recency: 0 }],
    rng: createRng('test'),
    locals: {},
    audience: [],
    ...over,
  });
}

beforeEach(() => {
  if (slices.get('character') === undefined) registerGameSlices();
});

// ---------------------------------------------------------------------------
// Mô hình và cây vùng
// ---------------------------------------------------------------------------

describe('cổng gác cho nội dung tự viết', () => {
  /**
   * Bài này là công cụ của NGƯỜI VIẾT NỘI DUNG, không phải của người viết code.
   *
   * Bỏ một file `.json` vào `/lorebooks` rồi chạy `npx vitest run src/lore` —
   * nếu file sai một dấu phẩy hay thiếu một field bắt buộc, chỗ sai được in ra
   * theo từng dòng. Không có bài này thì lỗi chỉ lộ ra lúc đang chơi, dưới dạng
   * "sách biến mất", và không ai đoán được vì sao.
   */
  it('mọi file trong /lorebooks phải đọc được', () => {
    const seed = seedBooks();
    const fatal = seed.issues.filter((issue) => issue.includes('Không nhận ra định dạng'));

    if (seed.issues.length > 0) {
      console.log(`\nCẢNH BÁO khi nạp /lorebooks:\n${seed.issues.map((line) => `  ! ${line}`).join('\n')}`);
    }
    expect(fatal, fatal.join('\n')).toEqual([]);
  });

  it('không có hai entry trùng id giữa các sách', () => {
    // Trùng id thì sách priority cao nuốt sách kia, và entry bị nuốt biến mất
    // không dấu vết — kiểu hỏng người viết nội dung không tài nào đoán ra.
    expect(duplicateIds(seedBooks().books)).toEqual([]);
  });

  it('entry constant phải ngắn và phải có summary', () => {
    const offenders: string[] = [];
    for (const book of seedBooks().books) {
      for (const entry of book.entries) {
        if (!entry.constant) continue;
        // Entry constant vào prompt MỌI lượt; một entry constant dài là khoản
        // thuế đánh vào từng lượt chơi cho tới hết ván.
        if (entry.content.length > 600) offenders.push(`${entry.id}: dài ${entry.content.length} ký tự`);
        if (entry.summary === undefined) offenders.push(`${entry.id}: thiếu summary`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('trigger nào cũng phải có triggerOnce hoặc triggerCooldown', () => {
    const offenders: string[] = [];
    for (const book of seedBooks().books) {
      for (const entry of book.entries) {
        if ((entry.triggers ?? []).length === 0) continue;
        if (entry.triggerOnce || entry.triggerCooldown !== undefined) continue;
        offenders.push(`${entry.id}: có trigger mà không có triggerOnce/triggerCooldown`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it("entry 'gated' phải khai requiresKnowledge", () => {
    // `gated` mà không đòi tri thức nào thì cổng L5 cho qua tuốt — nó thành
    // `public` đội lốt, và người viết tưởng mình đã giấu xong một bí mật.
    const offenders: string[] = [];
    for (const book of seedBooks().books) {
      for (const entry of book.entries) {
        if (entry.knowledge !== 'gated') continue;
        if ((entry.requiresKnowledge ?? []).length === 0) {
          offenders.push(`${entry.id}: gated mà không đòi tri thức nào`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('audience của variants phải là id có thật trong nations.json / races.json', () => {
    // Engine so khớp NGUYÊN VĂN. Gõ sai một chữ thì biến thể không bao giờ được
    // chọn, và không có gì báo lỗi — entry vẫn chèn, chỉ là chèn bản trung lập.
    const known = new Set<string>([
      ...((nationsFile as { nations?: { id: string }[] }).nations ?? []).map((nation) => nation.id),
      ...((racesFile as { races?: { id: string }[] }).races ?? []).map((race) => race.id),
    ]);
    const offenders: string[] = [];

    for (const book of seedBooks().books) {
      for (const entry of book.entries) {
        for (const variant of entry.variants ?? []) {
          if (!known.has(variant.audience)) offenders.push(`${entry.id} → audience "${variant.audience}"`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('related không được trỏ tới id không tồn tại', () => {
    const books = seedBooks().books;
    const ids = new Set(books.flatMap((book) => book.entries.map((entry) => entry.id)));
    const offenders: string[] = [];

    for (const book of books) {
      for (const entry of book.entries) {
        for (const relation of entry.related ?? []) {
          if (!ids.has(relation.id)) offenders.push(`${entry.id} → related "${relation.id}" không tồn tại`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('regions phải trỏ tới vùng có trong cây vùng', () => {
    const known = new Set(allRegions().map((region) => region.id));
    const offenders: string[] = [];

    for (const book of seedBooks().books) {
      for (const entry of book.entries) {
        for (const region of entry.regions ?? []) {
          if (!known.has(region)) offenders.push(`${entry.id} → vùng "${region}" không có trong regions.json`);
        }
        const ref = book.scope.refId;
        if (book.scope.kind === 'region' && ref !== undefined && !known.has(ref)) {
          offenders.push(`sách "${book.name}" → vùng "${ref}" không có trong regions.json`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('mô hình dữ liệu (mục 2)', () => {
  it('nạp được sách mẫu và điền đủ mặc định', () => {
    const loaded = books();
    expect(loaded.length).toBeGreaterThanOrEqual(3);

    const total = loaded.reduce((sum, book) => sum + book.entries.length, 0);
    expect(total).toBeGreaterThanOrEqual(15);

    const entry = loaded[0]?.entries[0];
    // Field không khai trong file phải có mặc định an toàn sau khi qua Zod.
    expect(entry?.matchMode).toBe('plain');
    expect(entry?.recurse).toBe(false);
    expect(entry?.knowledge).toBe('public');
    expect(entry?.placement).toBe('block');
  });

  it('sách mẫu phủ đủ các tính năng mà mục 13.9 đòi', () => {
    const entries = books().flatMap((book) => book.entries);
    expect(entries.some((entry) => entry.constant)).toBe(true);
    expect(entries.some((entry) => entry.knowledge === 'gated')).toBe(true);
    expect(entries.some((entry) => entry.knowledge === 'secret')).toBe(true);
    expect(entries.some((entry) => (entry.variants ?? []).length > 0)).toBe(true);
    expect(entries.some((entry) => (entry.related ?? []).length > 0)).toBe(true);
    expect(entries.some((entry) => entry.recurse)).toBe(true);
    expect(entries.some((entry) => (entry.triggers ?? []).length > 0)).toBe(true);
    expect(entries.some((entry) => entry.validFrom !== undefined)).toBe(true);
    expect(entries.some((entry) => (entry.regions ?? []).length > 0)).toBe(true);
    expect(entries.some((entry) => entry.placement !== 'block')).toBe(true);
    expect(duplicateIds(books())).toEqual([]);
  });
});

describe('cây vùng (mục 3)', () => {
  it('"nằm trong" đi lên tới gốc', () => {
    expect(isWithin(EHRENFELD, 'prov_swabia')).toBe(true);
    expect(isWithin(EHRENFELD, 'realm_hre')).toBe(true);
    expect(isWithin(EHRENFELD, 'reg_europa')).toBe(true);
    expect(isWithin(EHRENFELD, 'prov_champagne')).toBe(false);
  });

  it('nội dung của MỘT ĐIỂM không lan sang điểm khác cùng tỉnh', () => {
    // Cùng ở Swabia, nhưng entry gắn với làng Brogg thì không phải chuyện của
    // thành Ehrenfeld.
    expect(isWithin(EHRENFELD, 'hold_brogg')).toBe(false);
  });

  it('kề nhau tính cả theo tổ tiên', () => {
    expect(isAdjacent('hold_muhldorf', 'prov_swabia')).toBe(true);
    expect(isAdjacent(EHRENFELD, 'prov_champagne')).toBe(false);
  });

  it('includeAdjacent mở rộng đúng một bậc', () => {
    expect(matchesRegions('hold_muhldorf', ['prov_swabia'], false).passed).toBe(false);
    expect(matchesRegions('hold_muhldorf', ['prov_swabia'], true).passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mục 13.10 — BÀI TEST BẮT BUỘC
// ---------------------------------------------------------------------------

describe('lớp L3 — đứng vùng A thì entry vùng B không chèn (mục 13.10)', () => {
  const text = 'Ngài hỏi thăm về hội chợ Troyes bên Champagne và giá len ở đó.';

  it('sách của vùng B tự tắt ở L1 khi người chơi đứng ở vùng A', () => {
    const result = scan({ state: freshState(EHRENFELD), texts: [{ text, recency: 0 }] });

    const champagne = result.books.find((book) => book.bookId === 'book-champagne');
    expect(champagne?.active).toBe(false);
    expect(result.activated.some((entry) => entry.entry.id === 'thanh-troyes')).toBe(false);

    const blocked = result.decisions.find((entry) => entry.entryId === 'thanh-troyes');
    expect(blocked?.blockedAt).toBe('L1');
  });

  it('entry của vùng B nằm trong sách ĐANG BẬT vẫn bị L3 chặn, dù khớp từ khóa', () => {
    const result = scan({ state: freshState(EHRENFELD), texts: [{ text, recency: 0 }] });

    // `hoi-cho-champagne` nằm trong sách toàn cục, nên L1 cho qua.
    const decision = result.decisions.find((entry) => entry.entryId === 'hoi-cho-champagne');
    expect(decision?.layers.find((layer) => layer.layer === 'L1')?.passed).toBe(true);
    expect(decision?.blockedAt).toBe('L3');
    expect(decision?.layers.find((layer) => layer.layer === 'L3')?.reason).toContain('không thuộc');
    expect(result.activated.some((entry) => entry.entry.id === 'hoi-cho-champagne')).toBe(false);
  });

  it('đứng ở vùng B thì đúng entry đó lại vào', () => {
    const result = scan({ state: freshState(TROYES), texts: [{ text, recency: 0 }] });

    expect(result.books.find((book) => book.bookId === 'book-champagne')?.active).toBe(true);
    expect(result.activated.some((entry) => entry.entry.id === 'thanh-troyes')).toBe(true);
    expect(result.activated.some((entry) => entry.entry.id === 'hoi-cho-champagne')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// L1 — bốn kiểu scope của mục 3
// ---------------------------------------------------------------------------

describe('L1 — sách tự bật theo phe và theo chủng tộc (mục 3)', () => {
  function sachAutoScope(kind: Lorebook['scope']['kind'], refId: string): Lorebook {
    return lorebookSchema.parse({
      id: `book-${kind}-${refId}`,
      name: `Thử ${kind}`,
      scope: { kind, refId },
      autoScope: true,
      entries: [loreEntrySchema.parse({ id: `e-${kind}-${refId}`, title: 't', content: 'C', keys: ['thử'] })],
    });
  }

  function voi(over: { race?: string; faction?: string; regionId?: string }): GameState {
    const state = freshState(over.regionId ?? EHRENFELD);
    const knowledge = state['knowledge'] as { factionId: string };
    knowledge.factionId = over.faction ?? '';
    if (over.race !== undefined) {
      (state['character'] as { identity: { race: string } }).identity.race = over.race;
    }
    return state;
  }

  it("kind 'faction' bật theo phe đang chọn, không còn luôn tắt", () => {
    const book = sachAutoScope('faction', 'nation_hanse');
    expect(bookActivation(book, voi({ faction: 'nation_hanse' }), EHRENFELD).active).toBe(true);

    const khac = bookActivation(book, voi({ faction: 'nation_giao-trieu' }), EHRENFELD);
    expect(khac.active).toBe(false);
    expect(khac.reason).toContain('nation_giao-trieu');

    // Chưa chọn phe thì tắt, và phải nói rõ vì sao chứ không im lặng.
    expect(bookActivation(book, voi({}), EHRENFELD).reason).toContain('chưa chọn phe');
  });

  it("kind 'nation' có hai đường vào: đứng trong đất, hoặc thuộc về nó", () => {
    const book = sachAutoScope('nation', 'realm_france');
    // Đường địa lý.
    expect(bookActivation(book, voi({ regionId: TROYES }), TROYES).active).toBe(true);
    // Đường thần dân — đứng ở Swabia mà vẫn là người của nước Pháp.
    const book2 = sachAutoScope('nation', 'nation_frank');
    expect(bookActivation(book2, voi({ faction: 'nation_frank' }), EHRENFELD).active).toBe(true);
  });

  it("kind 'race' bật cả khi đứng trên đất của tộc đó, không chỉ khi mang tộc đó", () => {
    const book = sachAutoScope('race', 'race_lun-nui');

    // Vế một: nhân vật là tộc đó.
    expect(bookActivation(book, voi({ race: 'race_lun-nui' }), EHRENFELD).active).toBe(true);

    // Vế hai: races.json khai `homelands` của Lùn Núi có prov_alps — đứng trong
    // đó là bật, dù nhân vật là tộc khác. Trước khi races.json có dữ liệu thì
    // vế này không chạy được.
    const trongNui = bookActivation(book, voi({ race: 'race_teuton', regionId: 'prov_alps' }), 'prov_alps');
    expect(trongNui.active).toBe(true);
    expect(trongNui.reason).toContain('đất của tộc');

    expect(bookActivation(book, voi({ race: 'race_teuton' }), EHRENFELD).active).toBe(false);
  });

  it("'reg_europa' trong homelands KHÔNG biến sách chủng tộc thành sách toàn cục", () => {
    // Bán Tiên khai homelands là cả lục địa. Nếu tính nó là "vùng đa số" thì
    // sách của Bán Tiên bật ở mọi chỗ, tức là `race` thành `global` trá hình.
    const book = sachAutoScope('race', 'race_ban-tien');
    expect(bookActivation(book, voi({ race: 'race_teuton' }), EHRENFELD).active).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Năm lớp
// ---------------------------------------------------------------------------

describe('năm lớp chạy đúng thứ tự (mục 4)', () => {
  it('L2 chặn entry chưa tới ngày', () => {
    // Mốc phải khai TAY chứ không mượn ngày mở màn của chiến dịch: mở màn dời
    // một lần là bài này đổi nghĩa mà không ai nhận ra.
    const result = scan({
      now: { year: 1444, month: 1, day: 1, hour: 6 },
      texts: [{ text: 'nghe nói có dịch bệnh', recency: 0 }],
    });
    const decision = result.decisions.find((entry) => entry.entryId === 'dich-hach');
    expect(decision?.blockedAt).toBe('L2');
    expect(decision?.layers.find((layer) => layer.layer === 'L2')?.reason).toContain('chưa tới');
  });

  it('L2 cho qua khi lịch đã đi tới ngày hiệu lực', () => {
    const state = freshState();
    const result = scan({
      state,
      now: { year: 1444, month: 8, day: 1, hour: 6 },
      texts: [{ text: 'nghe nói có dịch bệnh', recency: 0 }],
    });
    expect(result.activated.some((entry) => entry.entry.id === 'dich-hach')).toBe(true);
  });

  it('L4 chạy condition bằng EJS, và condition hỏng thì coi như sai', () => {
    const state = freshState();
    const book = lorebookSchema.parse({
      id: 'book-test',
      name: 'Thử condition',
      entries: [
        loreEntrySchema.parse({ id: 'e-ok', title: 'ok', content: 'A', keys: ['thử'], condition: 'so > 2' }),
        loreEntrySchema.parse({ id: 'e-sai', title: 'sai', content: 'B', keys: ['thử'], condition: 'so < 2' }),
        loreEntrySchema.parse({ id: 'e-hong', title: 'hỏng', content: 'C', keys: ['thử'], condition: 'khong.co' }),
      ],
    });

    const result = scanLore({
      books: [book],
      state,
      turn: 1,
      now: state.meta.gameDate,
      regionId: EHRENFELD,
      texts: [{ text: 'thử', recency: 0 }],
      rng: createRng('test'),
      locals: { so: 5 },
      audience: [],
    });

    expect(result.activated.map((entry) => entry.entry.id)).toEqual(['e-ok']);
    expect(result.decisions.find((entry) => entry.entryId === 'e-hong')?.blockedAt).toBe('L4');
  });

  it('L4 chỉ chạy sau khi L1–L3 đã lọc — entry sai vùng không tốn một lần render EJS', () => {
    const result = scan({ texts: [{ text: 'hội chợ Champagne', recency: 0 }] });
    const decision = result.decisions.find((entry) => entry.entryId === 'hoi-cho-champagne');
    // Bị chặn ở L3 nên L4 không được ghi vào biên bản: nó chưa từng chạy.
    expect(decision?.layers.some((layer) => layer.layer === 'L4')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mục 5 — cổng tri thức (mục 14 đòi đưa ra một ca bị loại ở L5)
// ---------------------------------------------------------------------------

describe('cổng tri thức (mục 5)', () => {
  it('secret KHÔNG BAO GIỜ vào prompt chính', () => {
    const result = scan({ texts: [{ text: 'nghe nói có mỏ sắt trong rừng Ehr', recency: 0 }] });
    const decision = result.decisions.find((entry) => entry.entryId === 'mo-sat-bi-mat');

    expect(decision?.blockedAt).toBe('L5');
    expect(decision?.layers.find((layer) => layer.layer === 'L5')?.reason).toContain('không bao giờ');
    expect(result.activated.some((entry) => entry.entry.id === 'mo-sat-bi-mat')).toBe(false);
  });

  it('secret LẠI vào được prompt của mô phỏng ngầm', () => {
    const result = scan({
      texts: [{ text: 'mỏ sắt', recency: 0 }],
      channel: 'worldtick',
    });
    expect(result.activated.some((entry) => entry.entry.id === 'mo-sat-bi-mat')).toBe(true);
  });

  it('gated bị chặn khi nhân vật chưa biết tri thức cần có', () => {
    const result = scan({ texts: [{ text: 'có âm mưu gì đó', recency: 0 }] });
    const decision = result.decisions.find((entry) => entry.entryId === 'am-muu-reinhard');
    expect(decision?.blockedAt).toBe('L5');
    expect(decision?.layers.find((layer) => layer.layer === 'L5')?.reason).toContain('chưa biết');
  });

  it('gated qua được khi đã biết, và biết ở mức tin đồn thì chèn KÈM GHI CHÚ', () => {
    const state = freshState();
    const gained = gainKnowledgeOp(state, { id: 'biet-thu-cua-reinhard', source: 'nghe lỏm', confidence: 30 }, 3);
    expect(gained).not.toBeNull();

    const applied = applyPatch(state, [gained!], { actor: 'engine' });
    expect(applied.applied).toBe(true);

    const result = scan({ state: applied.next!, texts: [{ text: 'có âm mưu gì đó', recency: 0 }] });
    const entry = result.activated.find((item) => item.entry.id === 'am-muu-reinhard');
    expect(entry).toBeDefined();
    expect(entry?.note).toContain('TIN ĐỒN');
  });

  it('biết chắc thì không kèm ghi chú dè dặt nữa', () => {
    const state = freshState();
    const op = gainKnowledgeOp(state, { id: 'biet-thu-cua-reinhard', source: 'đọc được thư', confidence: 90 }, 3);
    const applied = applyPatch(state, [op!], { actor: 'engine' });

    const gate = checkGate(
      { knowledge: 'gated', requiresKnowledge: ['biet-thu-cua-reinhard'] },
      applied.next!,
    );
    expect(gate.passed).toBe(true);
    expect(gate.note).toBeUndefined();
  });

  it('tri thức chỉ ghi được qua MVU, và AI có quyền ghi vào đó', () => {
    expect(knowledgeSlice.permissions?.['known.*']).toBe('ai');
    expect(knowledgeSlice.permissions?.['entries.*']).toBe('engine');
  });
});

// ---------------------------------------------------------------------------
// Từ khóa, biến thể, quan hệ, đệ quy
// ---------------------------------------------------------------------------

describe('từ khóa (mục 2)', () => {
  it('plain khớp trong từ, wholeWord thì không', () => {
    expect(matchKeys('muối mỏ', ['muối'], 'plain', false)).toEqual(['muối']);
    expect(matchKeys('chợ muối', ['muối'], 'wholeWord', false)).toEqual(['muối']);
    // Ranh giới phải hiểu chữ có dấu: "muối" không nằm trong "muôi".
    expect(matchKeys('cái muôi', ['muối'], 'wholeWord', false)).toEqual([]);
  });

  it('caseSensitive được tôn trọng', () => {
    expect(matchKeys('Reinhard', ['reinhard'], 'plain', true)).toEqual([]);
    expect(matchKeys('Reinhard', ['reinhard'], 'plain', false)).toEqual(['reinhard']);
  });

  it('regex có nguy cơ treo bị từ chối chứ không chạy thử', () => {
    expect(matchKeys('aaaaaaaaaaaaaaaaaaaa!', ['(a+)+$'], 'regex', false)).toEqual([]);
  });

  it('keysSecondary NOT_ANY chặn được entry', () => {
    const state = freshState();
    const book = lorebookSchema.parse({
      id: 'book-sec',
      name: 'Từ khóa phụ',
      entries: [
        loreEntrySchema.parse({
          id: 'e-not',
          title: 'không nhắc vua',
          content: 'X',
          keys: ['thuế'],
          keysSecondary: { logic: 'NOT_ANY', keys: ['vua'] },
        }),
      ],
    });
    const base = {
      books: [book],
      state,
      turn: 1,
      now: state.meta.gameDate,
      regionId: EHRENFELD,
      rng: createRng('t'),
      locals: {},
      audience: [],
    };

    expect(scanLore({ ...base, texts: [{ text: 'chuyện thuế', recency: 0 }] }).activated).toHaveLength(1);
    expect(scanLore({ ...base, texts: [{ text: 'thuế của vua', recency: 0 }] }).activated).toHaveLength(0);
  });
});

describe('biến thể và quan hệ (mục 6, 7)', () => {
  it('chọn variant theo phe của nhân vật', () => {
    // Tag là id trần của `data/nations.json`, đúng dạng hướng dẫn viết lorebook
    // bảo người viết dùng — không phải dạng `nation:hre` của bản đầu.
    const hre = scan({ texts: [{ text: 'hiệp ước 1431', recency: 0 }], audience: ['nation_hre'] });
    const papacy = scan({ texts: [{ text: 'hiệp ước 1431', recency: 0 }], audience: ['nation_giao-trieu'] });

    expect(hre.activated.find((entry) => entry.entry.id === 'hiep-uoc-swabia')?.content).toContain('Hoàng đế');
    expect(papacy.activated.find((entry) => entry.entry.id === 'hiep-uoc-swabia')?.content).toContain('Rome');
  });

  it('không khớp phe nào thì dùng content gốc', () => {
    const result = scan({ texts: [{ text: 'hiệp ước 1431', recency: 0 }], audience: ['race_lam-tien'] });
    expect(result.activated.find((entry) => entry.entry.id === 'hiep-uoc-swabia')?.content).toContain(
      'giữ hòa bình nội bộ',
    );
  });

  it('entry được kéo vào qua related mà không cần khớp từ khóa', () => {
    const result = scan({ texts: [{ text: 'Ehrenfeld', recency: 0 }] });
    const pulled = result.activated.find((entry) => entry.entry.id === 'ba-tuoc-reinhard');

    expect(pulled).toBeDefined();
    expect(pulled?.pulledBy).toBe('thanh-ehrenfeld');
    expect(pulled?.matchedKeys).toEqual([]);
    // pullWeight 0.8 nhân vào điểm, nên nó không được vượt entry đã kéo nó vào.
    const puller = result.activated.find((entry) => entry.entry.id === 'thanh-ehrenfeld');
    expect(pulled!.score).toBeLessThan(puller!.score);
  });

  it('quan hệ chỉ kéo MỘT tầng', () => {
    const state = freshState();
    const book = lorebookSchema.parse({
      id: 'book-chain',
      name: 'Chuỗi quan hệ',
      entries: [
        loreEntrySchema.parse({ id: 'a', title: 'A', content: 'A', keys: ['mở'], related: [{ id: 'b', pullWeight: 1 }] }),
        loreEntrySchema.parse({ id: 'b', title: 'B', content: 'B', related: [{ id: 'c', pullWeight: 1 }] }),
        loreEntrySchema.parse({ id: 'c', title: 'C', content: 'C' }),
      ],
    });

    const result = scanLore({
      books: [book],
      state,
      turn: 1,
      now: state.meta.gameDate,
      regionId: EHRENFELD,
      texts: [{ text: 'mở', recency: 0 }],
      rng: createRng('t'),
      locals: {},
      audience: [],
    });

    expect(result.activated.map((entry) => entry.entry.id).sort()).toEqual(['a', 'b']);
  });
});

describe('đệ quy (mục 8)', () => {
  it('nội dung entry recurse được quét lại và kéo thêm entry', () => {
    // "Reinhard" khớp từ tin nhắn; nội dung của nó nhắc "rừng Ehr", và entry
    // tranh chấp rừng Ehr vào được nhờ vòng đệ quy chứ không nhờ tin nhắn gốc.
    const result = scan({ texts: [{ text: 'hỏi về bá tước Reinhard', recency: 0 }] });
    const pulled = result.activated.find((entry) => entry.entry.id === 'tranh-chap-rung-ehr');

    expect(pulled).toBeDefined();
    expect(pulled?.depth).toBe(1);
  });

  it('preventRecursion chặn entry chỉ kích được từ tin nhắn gốc', () => {
    const state = freshState();
    const book = lorebookSchema.parse({
      id: 'book-rec',
      name: 'Đệ quy',
      entries: [
        loreEntrySchema.parse({ id: 'goc', title: 'gốc', content: 'nhắc tới bí mật', keys: ['mở'], recurse: true }),
        loreEntrySchema.parse({ id: 'kin', title: 'kín', content: 'X', keys: ['bí mật'], preventRecursion: true }),
      ],
    });

    const result = scanLore({
      books: [book],
      state,
      turn: 1,
      now: state.meta.gameDate,
      regionId: EHRENFELD,
      texts: [{ text: 'mở', recency: 0 }],
      rng: createRng('t'),
      locals: {},
      audience: [],
    });

    expect(result.activated.map((entry) => entry.entry.id)).toEqual(['goc']);
    expect(result.decisions.find((entry) => entry.entryId === 'kin')?.layers[0]?.reason).toContain(
      'preventRecursion',
    );
  });
});

// ---------------------------------------------------------------------------
// Ngân sách (mục 9)
// ---------------------------------------------------------------------------

describe('ngân sách khối 4 (mục 9)', () => {
  it('hết ngân sách thì dùng summary thay vì bỏ hẳn', () => {
    const result = scan({ texts: [{ text: 'tranh chấp rừng Ehr', recency: 0 }] });
    const entry = result.activated.find((item) => item.entry.id === 'tranh-chap-rung-ehr');
    expect(entry).toBeDefined();

    // Ngân sách vừa đủ cho bản tóm tắt, không đủ cho bản đầy.
    const selection = selectWithinBudget([entry!], result.decisions, 40);
    expect(selection.items[0]?.content).toBe(entry!.entry.summary);
    expect(result.decisions.find((item) => item.entryId === 'tranh-chap-rung-ehr')?.outcome).toBe(
      'chèn bản tóm tắt',
    );
  });

  it('không đủ cho cả summary thì bị loại, và nói rõ ở lớp budget', () => {
    const result = scan({ texts: [{ text: 'tranh chấp rừng Ehr', recency: 0 }] });
    const entry = result.activated.find((item) => item.entry.id === 'tranh-chap-rung-ehr');

    const selection = selectWithinBudget([entry!], result.decisions, 1);
    expect(selection.items).toHaveLength(0);
    expect(selection.dropped[0]?.id).toBe('tranh-chap-rung-ehr');

    const decision = result.decisions.find((item) => item.entryId === 'tranh-chap-rung-ehr');
    expect(decision?.blockedAt).toBe('budget');
  });

  it('entry constant đứng đầu hàng nhưng vẫn tranh ngân sách', () => {
    const result = scan({ texts: [{ text: 'Ehrenfeld', recency: 0 }] });
    // Thưởng constant rất lớn nên nó tự đứng đầu, không cần luật riêng.
    expect(result.activated[0]?.entry.id).toBe('giao-hoi');

    // Ngân sách chật: nó lấy chỗ trước, những entry sau phải chen chỗ còn lại
    // hoặc bị cắt.
    const selection = selectWithinBudget(result.activated, result.decisions, 180);
    expect(selection.items[0]?.id).toBe('giao-hoi');
    expect(selection.used).toBeLessThanOrEqual(180);
    expect(selection.dropped.length).toBeGreaterThan(0);
  });

  it('ngân sách bằng 0 thì constant cũng không lọt — nó không đứng trên ngân sách', () => {
    const result = scan({ texts: [{ text: 'Ehrenfeld', recency: 0 }] });
    const selection = selectWithinBudget(result.activated, result.decisions, 0);
    expect(selection.items).toHaveLength(0);
  });

  it('entry placement depth tách khỏi khối 4', () => {
    const result = scan({ texts: [{ text: 'vây hãm thành', recency: 0 }] });
    const selection = selectWithinBudget(result.activated, result.decisions, 5000);

    expect(selection.depthItems.map((item) => item.id)).toContain('cong-thanh-swabia');
    expect(selection.items.map((item) => item.id)).not.toContain('cong-thanh-swabia');
  });
});

// ---------------------------------------------------------------------------
// Trigger (mục 10)
// ---------------------------------------------------------------------------

describe('trigger (mục 10)', () => {
  beforeEach(() => {
    events.clear();
    registerLoreHandlers();
  });

  it('CHỈ phát event, và biến thành PatchOp chứ không ghi thẳng state', () => {
    const state = freshState();
    const result = scan({ state, texts: [{ text: 'chuyện thuế muối ngoài chợ', recency: 0 }] });
    const entry = result.activated.find((item) => item.entry.id === 'tin-don-thue-muoi');
    expect(entry).toBeDefined();

    const before = JSON.stringify(state);
    const outcome = fireTriggers([entry!], {
      state,
      turn: 5,
      now: state.meta.gameDate,
      regionId: EHRENFELD,
      previousRegionId: EHRENFELD,
    });

    // State KHÔNG được đổi trong lúc bắn event.
    expect(JSON.stringify(state)).toBe(before);
    expect(outcome.fired[0]?.event).toBe(LORE_EVENTS.rumorSpread);

    const push = outcome.ops.find((op) => op.path === 'character.notes.rumors');
    expect(push?.op).toBe('push');

    // Và op đó phải qua được MVU thật.
    const applied = applyPatch(state, outcome.ops, { actor: 'engine' });
    expect(applied.applied).toBe(true);
    expect((applied.next?.['character'] as { notes: { rumors: string[] } }).notes.rumors).toHaveLength(1);
  });

  it('triggerOnce chặn lần bắn thứ hai', () => {
    const state = freshState();
    const result = scan({ state, texts: [{ text: 'thuế muối', recency: 0 }] });
    const entry = result.activated.find((item) => item.entry.id === 'tin-don-thue-muoi')!;

    const first = fireTriggers([entry], {
      state,
      turn: 5,
      now: state.meta.gameDate,
      regionId: EHRENFELD,
      previousRegionId: EHRENFELD,
    });
    const applied = applyPatch(state, first.ops, { actor: 'engine' });
    expect(applied.applied).toBe(true);

    const second = fireTriggers([entry], {
      state: applied.next!,
      turn: 6,
      now: state.meta.gameDate,
      regionId: EHRENFELD,
      previousRegionId: EHRENFELD,
    });
    expect(second.fired).toHaveLength(0);
    expect(second.log.join(' ')).toContain('triggerOnce');
  });

  it('vượt trần mỗi lượt thì HOÃN chứ không bắn dồn', () => {
    const state = freshState();
    const many = Array.from({ length: MAX_LORE_EVENTS_PER_TURN + 3 }, (_, index) =>
      loreEntrySchema.parse({
        id: `spam-${index}`,
        title: `spam ${index}`,
        content: 'x',
        constant: true,
        triggers: [{ when: 'onActivate', emit: { event: LORE_EVENTS.notify, payload: { title: 't' } } }],
      }),
    );
    const book = lorebookSchema.parse({ id: 'book-spam', name: 'Spam', entries: many });

    const outcome = fireTriggers(
      many.map((entry) => ({
        entry,
        book,
        content: 'x',
        score: 1,
        matchedKeys: [],
        depth: 0,
      })),
      { state, turn: 1, now: state.meta.gameDate, regionId: EHRENFELD, previousRegionId: EHRENFELD },
    );

    expect(outcome.fired).toHaveLength(MAX_LORE_EVENTS_PER_TURN);
    expect(outcome.deferred).toHaveLength(3);
  });

  it('handler ném lỗi không làm chết lượt', () => {
    const state = freshState();
    events.on(LORE_EVENTS.notify, () => {
      throw new Error('handler hỏng');
    }, 'test');

    const entry = loreEntrySchema.parse({
      id: 'e',
      title: 'e',
      content: 'x',
      constant: true,
      triggers: [{ when: 'onActivate', emit: { event: LORE_EVENTS.notify, payload: {} } }],
    });
    const book = lorebookSchema.parse({ id: 'b', name: 'b', entries: [entry] });

    const outcome = fireTriggers([{ entry, book, content: 'x', score: 1, matchedKeys: [], depth: 0 }], {
      state,
      turn: 1,
      now: state.meta.gameDate,
      regionId: EHRENFELD,
      previousRegionId: EHRENFELD,
    });

    expect(outcome.fired).toHaveLength(1);
    expect(outcome.log.join(' ')).toContain('handler hỏng');
  });
});

// ---------------------------------------------------------------------------
// Một lượt trọn vẹn + chuyển đổi
// ---------------------------------------------------------------------------

describe('một lượt quét trọn vẹn', () => {
  beforeEach(() => {
    events.clear();
    registerLoreHandlers();
  });

  it('quét, render, cắt ngân sách, bắn trigger — và ghi nhớ để cooldown lượt sau', () => {
    const state = freshState();
    const pass = runLorePass({
      books: books(),
      state,
      turn: 1,
      now: state.meta.gameDate,
      regionId: EHRENFELD,
      previousRegionId: EHRENFELD,
      texts: [{ text: 'hỏi thăm ở chợ về thuế muối và về bá tước Reinhard', recency: 0 }],
      locals: {},
      audience: ['race_teuton'],
      rng: createRng('lore'),
    });

    expect(pass.items.length).toBeGreaterThan(0);
    expect(pass.used).toBeLessThanOrEqual(pass.limit);
    expect(pass.fired.length).toBeGreaterThan(0);

    // Op ghi nhớ phải áp được, nếu không thì cooldown và sticky vô nghĩa.
    const applied = applyPatch(state, pass.ops, { actor: 'engine' });
    expect(applied.applied).toBe(true);
    expect(Object.keys(knowledgeOf(applied.next!).entries).length).toBeGreaterThan(0);

    console.log(
      `\n--- lore pass ---\n${pass.items
        .map((item) => `[${item.score.toFixed(1)}] ${item.title} · ${item.tokens} token`)
        .join('\n')}\n${pass.used}/${pass.limit} token`,
    );
  });

  it('macro chạy trên nội dung VÀ trên summary của entry, trước EJS', () => {
    // Sách nhập từ SillyTavern dùng `{{user}}` rất dày. Macro của Phần 3 chỉ
    // chạy trên template của KHỐI, mà nội dung entry được EJS nhét vào khối sau
    // đó — nên nếu Phần 4 không tự chạy macro thì bốn dấu ngoặc nhọn đi thẳng
    // vào prompt.
    const state = freshState();
    const book = lorebookSchema.parse({
      id: 'book-macro',
      name: 'Thử macro',
      entries: [
        loreEntrySchema.parse({
          id: 'e-macro',
          title: 'macro',
          content: 'Ả gọi {{user}} là kẻ lạ. Năm nay là <%= now.year %>.',
          summary: 'Ả gọi {{user}} là kẻ lạ.',
          keys: ['thử macro'],
        }),
      ],
    });

    const run = (budgetTokens: number) =>
      runLorePass({
        books: [book],
        state,
        turn: 1,
        now: state.meta.gameDate,
        regionId: EHRENFELD,
        previousRegionId: EHRENFELD,
        texts: [{ text: 'thử macro', recency: 0 }],
        locals: { now: state.meta.gameDate },
        audience: [],
        rng: createRng('lore'),
        macros: createMacroContext({ gameDate: state.meta.gameDate, user: 'Aldric' }),
        budgetTokens,
      });

    const day = run(500).items[0];
    expect(day?.content).toBe('Ả gọi Aldric là kẻ lạ. Năm nay là 1444.');

    // Ngân sách chật thì ngân sách lấy `summary` — và bản đó cũng phải sạch.
    const ngan = run(14).items[0];
    expect(ngan?.content).toBe('Ả gọi Aldric là kẻ lạ.');
  });

  it('cùng seed cùng lượt cho ra cùng kết quả (R3)', () => {
    const state = freshState();
    const run = (): string[] =>
      runLorePass({
        books: books(),
        state,
        turn: 1,
        now: state.meta.gameDate,
        regionId: EHRENFELD,
        previousRegionId: EHRENFELD,
        texts: [{ text: 'nghe chuyện phép thuật ngoài chợ', recency: 0 }],
        locals: {},
        audience: [],
        rng: createRng('hat-giong-lore::lore::1'),
      }).items.map((item) => item.id);

    expect(run()).toEqual(run());
  });
});

describe('chuyển đổi World Info (mục 12)', () => {
  const worldInfo = {
    entries: {
      '0': {
        uid: 0,
        key: ['Ehrenfeld', 'thành'],
        keysecondary: ['tường'],
        selectiveLogic: 3,
        comment: 'Thành Ehrenfeld',
        content: 'Một thành nhỏ trên mỏm đá.',
        constant: false,
        order: 120,
        position: 4,
        depth: 3,
        caseSensitive: false,
        matchWholeWords: true,
        preventRecursion: true,
      },
      '1': { uid: 1, key: [], comment: 'Rỗng', content: '   ' },
    },
  };

  it('nhận ra file World Info mà không cần người dùng nói trước', () => {
    expect(looksLikeWorldInfo(worldInfo)).toBe(true);
    expect(looksLikeWorldInfo({ books: [] })).toBe(false);
  });

  it('ánh xạ đúng các field của mục 12 và đặt mặc định an toàn', () => {
    const { book, report } = convertWorldInfo(worldInfo, 'Sách cũ');
    const entry = book.entries[0];

    expect(report.total).toBe(1);
    expect(report.skipped).toEqual(['Rỗng']);
    expect(entry?.keys).toEqual(['Ehrenfeld', 'thành']);
    expect(entry?.keysSecondary).toEqual({ logic: 'AND_ALL', keys: ['tường'] });
    expect(entry?.weight).toBe(120);
    expect(entry?.placement).toEqual({ depth: 3 });
    expect(entry?.matchMode).toBe('wholeWord');
    expect(entry?.preventRecursion).toBe(true);
    // Mặc định an toàn: thấy được, nhưng không tự đệ quy.
    expect(entry?.knowledge).toBe('public');
    expect(entry?.recurse).toBe(false);
    // Sách chuyển sang chỉ bật tay, không tự bật theo vùng.
    expect(book.scope.kind).toBe('topic');
  });

  it('trình nạp tự nhận ra cả bốn định dạng', () => {
    expect(parseLoreFile(worldInfo, 'x').books).toHaveLength(1);
    expect(parseLoreFile(JSON.parse(JSON.stringify({ kind: 'eu1444-lorebook', schemaVersion: 1, exportedAt: 0, books: books() })) as unknown).books.length).toBe(books().length);
    expect(parseLoreFile(books()[0] as unknown).books).toHaveLength(1);
    expect(parseLoreFile(books() as unknown).books.length).toBe(books().length);
    expect(parseLoreFile({ rác: true }).books).toHaveLength(0);
  });
});
