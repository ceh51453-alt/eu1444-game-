/**
 * VÒNG LẶP LƯỢT NỐI VÀO UI (Phần 3 mục 12.9).
 *
 * Đây là chỗ mười bước của Phần 0 gặp nhau lần đầu. Store này giữ những thứ
 * KHÔNG phải state game: chữ đang chảy về từ model, cảnh hiện tại, ngăn xếp
 * undo, và bản ghi lượt để dựng khối 9 và khối 10.
 *
 * Ngăn xếp undo chụp state TRƯỚC khi lượt chạy, kể cả vị trí xúc sắc — R3 nói
 * undo là để lấy lại một cú bấm nhầm, KHÔNG phải để tung lại một kết quả xấu.
 *
 * Bước 10 (ghi Tầng A) và vòng sửa lỗi TẦNG 2 (Phần 2 mục 6) cũng ở đây, vì
 * đây là chỗ duy nhất biết đủ ba thứ cùng lúc: state trước lượt, kết quả lượt,
 * và người chơi đang nhìn cái gì.
 */

import { create } from 'zustand';
import type { TurnInput, TurnRecord } from '@/core/turn';
import { configuredProfile, effectiveConfig, tokenLimits, useSettingsStore } from '@/state/settings';
import { getProvider } from '@/ai/provider';
import { DEFAULT_BUDGET, providerCounter, type BudgetConfig } from '@/ai/budget';
import { buildPromptLocals, emptyRoll, runTurn, type PromptInput, type TurnResult } from '@/ai/pipeline';
import { createMacroContext, macroRng } from '@/ai/macros';
import { DEFAULT_LORE_BUDGET } from '@/lore/budget';
import { emptyScene, type SceneContext, type TurnEntry } from '@/ai/query';
import { usePromptStore } from '@/state/prompts';
import { runtimeBlocksForPreset } from '@/ai/preset/runtime';
import { TurnHistory, patchLog } from '@/state/history';
import { useGameStore } from '@/state/store';
import { computeDerived } from '@/state/derived';
import { applyPatch, type ApplyResult, type OpFailure, type PatchOp } from '@/state/mvu';
import { readPath, type GameState } from '@/state/slices';
import { bindArchiveSlot, openStorage, storageStatus } from '@/persist/storage';
import { AUTOSAVE_SLOT, type SaveSlotMeta } from '@/persist';
import {
  deleteCampaignSession,
  loadActiveSlot,
  loadCampaignSession,
  saveActiveSlot,
  saveCampaignSession,
  type CampaignSession,
} from '@/persist/session';
import { checkLog } from '@/systems/check';
import { createRng, createRngHub } from '@/core/rng';
import { DUEL_STREAM } from '@/minigames/duel';
import { BATTLE_STREAM } from '@/minigames/battle';
import { SIEGE_STREAM } from '@/systems/siege';
import {
  autoResolve,
  buildEncounter,
  type BuiltEncounter,
  type CombatSummary,
  type EncounterKind,
  type EncounterOffer,
} from '@/systems/encounter';
import { useLorebookStore } from '@/state/lorebooks';
import { currentFaction, currentRegion } from '@/lore/knowledge';
import {
  nameBookOf,
  powerSnapshots,
  powersAtWar,
  runWorldTick,
  situationOf,
  titleHoldings,
  worldStateOf,
} from '@/sim';
import { emptyLorePass, runLorePass, type LorePass } from '@/lore/pass';
import { registerLoreHandlers } from '@/lore/triggers';
import type { ScanText } from '@/lore/scanner';

const undoStack = new TurnHistory();

/** Lô còn lỗi sau khi AI đã tự sửa hai lần — đầu vào của modal tầng 2. */
export interface PendingReview {
  state: GameState;
  failures: OpFailure[];
  ops: PatchOp[];
  /** Biên bản lượt, chờ ghi cùng kết quả sửa tay. */
  record: TurnRecord;
}

export interface TurnState {
  /** Đã đọc xong tầng lưu trữ; UI không được cho bấm trước thời điểm này. */
  booted: boolean;
  /** File save đang nhận autosave và lịch sử của lượt kế tiếp. */
  activeSlotId: string;
  /** Danh sách file save để màn hình đầu và trình quản lý hiển thị. */
  slots: SaveSlotMeta[];
  running: boolean;
  /** Chữ model đang trả về, cập nhật theo từng mẩu SSE. */
  streaming: string;
  entries: TurnEntry[];
  scene: SceneContext;
  /**
   * CHỈ `lore` là của riêng store này. `total` và `reserveForOutput` được
   * `liveBudget()` lấy từ hồ sơ kết nối chính mỗi lần dùng — hai con số đó
   * thuộc về model đang chọn, không thuộc về ván chơi.
   */
  budget: BudgetConfig;
  /** Tên NPC đang đối thoại — giá trị macro `{{char}}`. */
  charName: string;
  last: TurnResult | null;
  error: string | null;
  canUndo: boolean;
  /** Khác `null` thì UI mở modal "Kiểm duyệt biến". */
  review: PendingReview | null;
  /** Tình trạng tầng lưu trữ, để tab Debug nói được vì sao không lưu được. */
  storageNote: string;
  savedAt: number | null;
  /** Kết quả quét lorebook gần nhất — panel "vì sao chèn/bị loại" đọc nó. */
  lore: LorePass;
  /** Popup lorebook xếp hàng, chờ Phần 15 hiện thực chỗ hiện chúng. */
  notices: { title: string; body: string }[];
  /** Một dòng về bước 8 vừa chạy: mấy tick sâu, mấy biến cố, mấy tin tới nơi. */
  tickNote: string;
  /**
   * Lời mời trận đánh AI vừa phát ra, đang chờ người chơi bấm.
   *
   * KHÔNG tự mở minigame. Một lớp phủ toàn màn hình ập vào giữa lúc người ta
   * đang đọc là cướp quyền điều khiển — xem `/src/systems/encounter/README.md`.
   */
  encounter: EncounterOffer | null;
  /** Vùng ở lượt trước, để trigger `onEnterRegion` biết mình vừa đổi vùng. */
  previousRegionId: string;
}

export interface TurnActions {
  /** Nạp save Tầng A lúc khởi động (Phần 0 mục 4). */
  boot(): Promise<void>;
  /** Bắt đầu một chiến dịch trắng trong một slot mới, không ghi đè ván cũ. */
  newCampaign(): Promise<void>;
  /** Nạp một file save đã chọn cùng toàn bộ phần chat của nó. */
  loadSlot(slotId: string): Promise<void>;
  /** Ghi đè ngay file đang chơi, kể cả khi chưa chạy lượt AI nào. */
  saveCurrent(): Promise<void>;
  /** Tạo một file save mới từ trạng thái hiện tại và chuyển sang file đó. */
  saveSlot(label: string): Promise<string>;
  deleteSlot(slotId: string): Promise<void>;
  refreshSlots(): Promise<void>;
  submit(text: string): Promise<void>;
  cancel(): void;
  undo(): void;
  /** Người chơi đã sửa tay xong ở modal tầng 2. */
  resolveReview(result: ApplyResult, manualOverride: boolean): void;
  /** Bỏ toàn bộ lô — state giữ nguyên (R4). */
  discardReview(): void;
  /**
   * Người chơi nhận lời mời: dựng ván và trả về cho UI mở màn hình.
   *
   * Trả `null` khi không có lời mời nào đang treo, hoặc khi dựng hỏng — R4 nói
   * một minigame không dựng được KHÔNG được làm chết lượt đang chơi.
   */
  acceptEncounter(): BuiltEncounter | null;
  /** Bỏ qua: engine đánh trọn trận, ghi hệ quả thật, rồi kể lại. */
  skipEncounter(): void;
  /**
   * Một trận vừa xong — nối kết quả vào dòng diễn biến VÀ vào biên bản lượt.
   *
   * Dùng cho cả hai đường: người chơi tự đánh xong ở màn hình minigame, và
   * engine đánh thay. Không có bước này thì lượt sau AI không biết trận nó vừa
   * mở ra đã kết thúc thế nào, và nó sẽ kể tiếp như chưa có gì xảy ra.
   */
  logCombat(told: CombatSummary, engineOps?: readonly PatchOp[]): void;
  setScene(patch: Partial<SceneContext>): void;
  setBudget(budget: BudgetConfig): void;
  /** Ngân sách THẬT: trần lorebook của store này + hai trần token của hồ sơ chính. */
  liveBudget(): BudgetConfig;
  setCharName(name: string): void;
  /** Một lượt quét lorebook trên một state cụ thể. */
  scanLore(state: GameState, actionText: string): LorePass;
  /** Quét thử một đoạn văn bản giả — nút "Thử quét" của mục 11. */
  dryRunLore(text: string): LorePass;
  /** Gói dữ liệu để panel XEM TRƯỚC của Prompt Manager render đúng cảnh hiện tại. */
  promptInput(): PromptInput;
  /** Tầng C: xuất ván chơi đang nhìn thấy ra một file JSON (Phần 0 mục 4). */
  exportSave(): Promise<string>;
  /** Tầng C: nạp một file vào. Ném khi file hỏng — save cũ giữ nguyên (R4). */
  importSave(): Promise<string>;
}

export type TurnStore = TurnState & TurnActions;

let inflight: AbortController | null = null;
let booting: Promise<void> | null = null;

function campaignSessionOf(state: TurnState): CampaignSession {
  return {
    version: 1,
    entries: state.entries,
    scene: state.scene,
    budget: state.budget,
    charName: state.charName,
    tickNote: state.tickNote,
    previousRegionId: state.previousRegionId,
  };
}

function entriesFromTurns(turns: readonly TurnRecord[]): TurnEntry[] {
  return turns.map((record) => ({
    turn: record.turn,
    gameDate: record.gameDate,
    action: record.input.text,
    narrative: record.narrative,
    outcome: record.outcome.checks.map((check) => check.narrativeHint).filter(Boolean).join(' · '),
  }));
}

async function checkpoint(slotId: string, label?: string): Promise<void> {
  const storage = await openStorage();
  if (storage === null) {
    useTurnStore.setState({ storageNote: storageStatus().message });
    return;
  }
  try {
    await storage.saveSnapshot(useGameStore.getState().snapshot(), slotId, label);
    await saveCampaignSession(slotId, campaignSessionOf(useTurnStore.getState()));
    useTurnStore.setState({ savedAt: Date.now(), storageNote: storageStatus().message });
  } catch (error) {
    useTurnStore.setState({ storageNote: `Không ghi được save: ${String(error)}` });
  }
}

/**
 * Bước 10 — ghi Tầng A, nối biên bản vào Tầng B.
 *
 * Ghi hỏng KHÔNG được làm hỏng lượt đang chơi: người chơi đã đọc đoạn văn rồi,
 * và một lỗi lưu trữ thì phải nói bằng lời chứ không phải nuốt mất lượt của
 * họ. Nhưng cũng KHÔNG được im lặng — Phần 0 mục 4 nói một save lặng lẽ hỏng
 * còn tệ hơn một save hỏng có tiếng.
 */
async function persist(record: TurnRecord): Promise<void> {
  const storage = await openStorage();
  if (storage === null) {
    useTurnStore.setState({ storageNote: storageStatus().message });
    return;
  }
  try {
    const slotId = useTurnStore.getState().activeSlotId;
    const report = await storage.persistTurn(useGameStore.getState().snapshot(), record, slotId);
    await saveCampaignSession(slotId, campaignSessionOf(useTurnStore.getState()));
    useTurnStore.setState({
      savedAt: Date.now(),
      storageNote:
        report.warnings.length === 0 ? storageStatus().message : report.warnings.join(' · '),
    });
  } catch (error) {
    useTurnStore.setState({ storageNote: `Không ghi được save: ${String(error)}` });
  }
}

/**
 * Dòng RNG riêng cho lorebook.
 *
 * Suy ra từ seed + số lượt, không rút từ dòng `main` — hệt cách macro của Phần
 * 3 làm và vì cùng một lý do: số entry có `probability` trong sách của người
 * chơi không được phép đẩy lệch xúc sắc của chính họ (R3).
 */
function loreRng(seed: string, turn: number): ReturnType<typeof createRng> {
  return createRng(`${seed}::lore::${turn}`);
}

/**
 * Phe và chủng tộc, để chọn variant của mục 6.
 *
 * Tag là ID TRẦN — `race_cao-tien`, `nation_ottoman` — chứ không phải `race:…`.
 * Hai lý do: đó là dạng hướng dẫn viết lorebook bảo người viết dùng, và nó
 * trùng nguyên văn id trong `data/races.json` với `data/nations.json`, nên gõ
 * sai một chữ là tra ra ngay thay vì im lặng không khớp biến thể nào.
 *
 * Phe đứng TRƯỚC tộc: `pickVariant` lấy tag khớp đầu tiên, và khi một chủ đề có
 * cả bản theo phe lẫn bản theo tộc thì bản theo phe sát ngữ cảnh hơn.
 */
function audienceOf(state: GameState): string[] {
  const character = state['character'];
  const race =
    typeof character === 'object' && character !== null
      ? (character as { identity?: { race?: unknown } }).identity?.race
      : undefined;

  const tags: string[] = [];
  const faction = currentFaction(state);
  if (faction !== '') tags.push(faction);
  if (typeof race === 'string' && race !== '') tags.push(race);
  return tags;
}

/** Dòng xúc sắc riêng của từng minigame (R3). */
function streamOf(kind: EncounterKind): string {
  if (kind === 'battle') return BATTLE_STREAM;
  if (kind === 'siege') return SIEGE_STREAM;
  return DUEL_STREAM;
}

/**
 * Nối kết quả một trận vào BIÊN BẢN của lượt vừa chạy, rồi ghi lại Tầng A.
 *
 * Nối vào biên bản cũ chứ không ghi một biên bản mới: cả hai tầng lưu trữ đều
 * khóa bản ghi theo `(slot, turn)`, nên một biên bản thứ hai cùng số lượt sẽ ĐÈ
 * LÊN đoạn văn AI vừa viết thay vì đứng cạnh nó. Trận đánh xảy ra BÊN TRONG lượt
 * ấy, nên nó thuộc về đúng bản ghi ấy.
 *
 * Ghi hỏng không được làm hỏng gì cả — người chơi đã đánh xong trận rồi.
 */
function archiveCombat(summary: string, ops: readonly PatchOp[] = []): void {
  const previous = useTurnStore.getState().last?.record;
  if (previous === undefined) return;
  void persist({
    ...previous,
    narrative: previous.narrative === '' ? summary : `${previous.narrative}\n\n${summary}`,
    outcome: { ...previous.outcome, engineOps: [...previous.outcome.engineOps, ...ops] },
  });
}

/**
 * Nhật ký patch của Phần 2 mục 8.
 *
 * `turn` truyền vào chứ không suy ra từ `before.meta.turn`: lô sửa tay ở tầng 2
 * chạy SAU khi bước 10 đã tăng lượt, nên suy ra sẽ ghi nhầm sang lượt kế tiếp.
 */
function recordPatch(
  turn: number,
  before: GameState,
  after: GameState,
  ops: readonly PatchOp[],
  manualOverride: boolean,
): void {
  patchLog.record({
    turn,
    seed: before.meta.seed,
    rngState: before.meta.rng,
    ops: [...ops],
    before,
    after,
    ts: Date.now(),
    ...(manualOverride ? { manualOverride: true } : {}),
  });
}

/**
 * BƯỚC 8 — MÔ PHỎNG NGẦM (Phần 15).
 *
 * Ba việc, và thứ tự của chúng là hợp đồng: dựng đầu vào từ state ĐÃ CHỐT, chạy
 * `runWorldTick`, rồi ghi kết quả lại qua store. Bản thân `runWorldTick` không
 * ghi state — nó trả về state mới, và chỗ này là nơi duy nhất chốt nó.
 *
 * HỒ SƠ `worldtick` CHƯA CẤU HÌNH thì chạy hoàn toàn bằng engine. Đó không phải
 * một trường hợp lỗi mà là một cách chơi hợp lệ (mục 5): thế giới vẫn vận động,
 * chỉ kém bất ngờ hơn. Cùng đường đi với nút "tắt hẳn LLM" ở tab Debug.
 */
async function runBackgroundTick(
  turn: number,
  minutes: number,
): Promise<{ note: string; eventCount: number; llmCallsUsed: number }> {
  const store = useGameStore.getState();
  const state = store.snapshot();

  const settings = useSettingsStore.getState();
  const cfg = effectiveConfig('worldtick');
  const world = worldStateOf(state);
  const llmReady = world?.budget.llmEnabled === true && cfg.baseUrl !== '' && cfg.model !== '';

  try {
    const deps = llmReady
      ? { provider: getProvider(cfg.providerId), cfg }
      : null;

    const result = await runWorldTick({
      state,
      hub: createRngHub(state.meta.seed, state.meta.rng),
      minutes,
      turn,
      names: nameBookOf(state),
      deep: {
        playerRegionId: currentRegion(state),
        playerPowerId: currentFaction(state),
        powers: { before: powerSnapshots(state), after: powerSnapshots(state) },
        atWar: powersAtWar(state),
        titles: titleHoldings(state),
        situation: situationOf(state),
        names: nameBookOf(state),
        ...(deps === null
          ? {}
          : { llm: { agents: deps, text: deps, pricing: settings.pricing.worldtick } }),
      },
    });

    if (result.next !== null) useGameStore.getState().commitBatch(result.next);

    // Op của engine bị MVU từ chối là BUG CỦA ENGINE, không phải AI viết ẩu —
    // nó phải nổi lên chứ không được nuốt (cùng luật với `engineFailures` của
    // vòng lặp lượt ở `ai/pipeline.ts`).
    const rejected = result.failures.length === 0 ? '' : ` · ${result.failures.length} op bị từ chối`;
    const repaired = result.report.repairs.length === 0 ? '' : ` · ${result.report.repairs.length} bất biến đã sửa`;

    return {
      note:
        `${result.deepTicks} tick sâu · ${result.report.events.length} biến cố · ` +
        `${result.report.arrivals.length} tin tới${repaired}${rejected}`,
      eventCount: result.report.events.length,
      llmCallsUsed: result.llmCallsUsed,
    };
  } catch (error) {
    return { note: `Mô phỏng ngầm hỏng: ${String(error)}`, eventCount: 0, llmCallsUsed: 0 };
  }
}

export const useTurnStore = create<TurnStore>()((set, get) => ({
  booted: false,
  activeSlotId: AUTOSAVE_SLOT,
  slots: [],
  running: false,
  streaming: '',
  entries: [],
  scene: emptyScene(),
  budget: DEFAULT_BUDGET,
  charName: '',
  last: null,
  error: null,
  canUndo: false,
  review: null,
  storageNote: 'Chưa mở tầng lưu trữ.',
  savedAt: null,
  lore: emptyLorePass(),
  notices: [],
  tickNote: '',
  previousRegionId: '',
  encounter: null,

  async boot() {
    if (get().booted) return;
    if (booting !== null) return booting;

    // Handler của lorebook phải sẵn sàng TRƯỚC lượt đầu tiên: trigger bắn event
    // mà không có ai nghe thì sự kiện biến mất không dấu vết (mục 10a).
    registerLoreHandlers();
    void useLorebookStore.getState().hydrate();

    booting = (async () => {
      const storage = await openStorage();
      if (storage === null) {
        set({ booted: true, storageNote: storageStatus().message });
        return;
      }

      try {
        const slots = (await storage.listSlots()).sort((left, right) => right.updatedAt - left.updatedAt);
        const remembered = await loadActiveSlot();
        const activeSlotId =
          (remembered !== null && slots.some((slot) => slot.id === remembered) ? remembered : slots[0]?.id) ??
          AUTOSAVE_SLOT;
        const saved = slots.length === 0 ? null : await storage.loadLive(activeSlotId);
        const session = saved === null ? null : await loadCampaignSession(activeSlotId);

        if (saved !== null) {
          useGameStore.getState().loadState(saved);
          useGameStore.getState().ensureSlices();
        }

        let restoredEntries = session?.entries ?? [];
        if (saved !== null && session === null) {
          // Save cũ chưa có kho phiên: dựng lại chat từ biên bản lượt để lần
          // nâng cấp đầu tiên không làm màn diễn biến trắng xóa.
          restoredEntries = entriesFromTurns((await storage.fullHistory(activeSlotId)).turns);
        }

        bindArchiveSlot(activeSlotId);
        set({
          booted: true,
          activeSlotId,
          slots,
          entries: restoredEntries,
          scene: session?.scene ?? emptyScene(),
          budget: session?.budget ?? DEFAULT_BUDGET,
          charName: session?.charName ?? '',
          tickNote: session?.tickNote ?? '',
          previousRegionId:
            session?.previousRegionId ?? currentRegion(useGameStore.getState().snapshot()),
          storageNote: storageStatus().message,
        });
      } catch (error) {
        // Save hỏng KHÔNG được chặn người chơi vào game — báo rõ rồi chơi tiếp
        // trên ván mới, và tuyệt đối không ghi đè lên file hỏng cho tới khi họ
        // chủ động chơi tiếp (R4).
        set({ booted: true, storageNote: `Save Tầng A không đọc được: ${String(error)}` });
      }
    })().finally(() => {
      booting = null;
    });
    return booting;
  },

  async newCampaign() {
    await get().boot();
    const slotId = `campaign-${Date.now().toString(36)}`;
    const seed = `van-${Date.now().toString(36)}`;
    useGameStore.getState().newGame(seed, '');
    useGameStore.getState().ensureSlices();
    undoStack.clear();
    patchLog.clear();
    checkLog.clear();
    bindArchiveSlot(slotId);
    set({
      activeSlotId: slotId,
      entries: [],
      scene: emptyScene(),
      budget: DEFAULT_BUDGET,
      charName: '',
      last: null,
      error: null,
      canUndo: false,
      review: null,
      lore: emptyLorePass(),
      notices: [],
      tickNote: '',
      encounter: null,
      previousRegionId: '',
    });
    await saveActiveSlot(slotId);
    await checkpoint(slotId, `Ván mới ${new Date().toLocaleString('vi-VN')}`);
    await get().refreshSlots();
  },

  async loadSlot(slotId) {
    await get().boot();
    const storage = await openStorage();
    if (storage === null) throw new Error(storageStatus().message);
    const saved = await storage.loadLive(slotId);
    if (saved === null) throw new Error('File save không còn tồn tại.');

    const session = await loadCampaignSession(slotId);
    const entries = session?.entries ?? entriesFromTurns((await storage.fullHistory(slotId)).turns);
    useGameStore.getState().loadState(saved);
    useGameStore.getState().ensureSlices();
    undoStack.clear();
    patchLog.clear();
    checkLog.clear();
    bindArchiveSlot(slotId);
    set({
      activeSlotId: slotId,
      entries,
      scene: session?.scene ?? emptyScene(),
      budget: session?.budget ?? DEFAULT_BUDGET,
      charName: session?.charName ?? '',
      tickNote: session?.tickNote ?? '',
      previousRegionId:
        session?.previousRegionId ?? currentRegion(useGameStore.getState().snapshot()),
      last: null,
      error: null,
      canUndo: false,
      review: null,
      encounter: null,
      lore: emptyLorePass(),
      notices: [],
    });
    await saveActiveSlot(slotId);
  },

  async saveCurrent() {
    await checkpoint(get().activeSlotId);
    await get().refreshSlots();
  },

  async saveSlot(label) {
    const storage = await openStorage();
    if (storage === null) throw new Error(storageStatus().message);
    const sourceSlotId = get().activeSlotId;
    const slotId = `save-${Date.now().toString(36)}`;
    const safeLabel = label.trim() === '' ? `Save ${new Date().toLocaleString('vi-VN')}` : label.trim();
    await storage.cloneSave(useGameStore.getState().snapshot(), sourceSlotId, slotId, safeLabel);
    await saveCampaignSession(slotId, campaignSessionOf(get()));
    await saveActiveSlot(slotId);
    bindArchiveSlot(slotId);
    set({ activeSlotId: slotId, savedAt: Date.now() });
    await get().refreshSlots();
    return slotId;
  },

  async deleteSlot(slotId) {
    if (slotId === get().activeSlotId) throw new Error('Không thể xóa file đang chơi. Hãy nạp file khác trước.');
    const storage = await openStorage();
    if (storage === null) throw new Error(storageStatus().message);
    await storage.deleteSave(slotId);
    await deleteCampaignSession(slotId);
    await get().refreshSlots();
  },

  async refreshSlots() {
    const storage = await openStorage();
    if (storage === null) return;
    const slots = (await storage.listSlots()).sort((left, right) => right.updatedAt - left.updatedAt);
    set({ slots });
  },

  promptInput() {
    const state = useGameStore.getState().snapshot();
    const settings = useSettingsStore.getState();
    return {
      state,
      derived: computeDerived(state),
      scene: get().scene,
      history: get().entries,
      lore: get().lore.items,
      // Xem trước là xem prompt của một lượt CHƯA chạy, mà xúc sắc thì tung ở
      // bước 2 — nên chỗ này rỗng, đúng như lúc chưa bấm gửi.
      roll: emptyRoll(),
      action: { kind: 'freeform', text: '(xem trước — chưa nhập hành động)' },
      budget: get().liveBudget(),
      regexScripts: settings.preset?.regexScripts ?? [],
      macroNest: settings.preset?.source.extensions?.SPreset?.MacroNest === true,
      charName: get().charName,
    };
  },

  async submit(text) {
    if (get().running) return;

    const settings = useSettingsStore.getState();
    const cfg = effectiveConfig('main');
    if (cfg.baseUrl.trim() === '' || cfg.model.trim() === '') {
      set({ error: 'Chưa cấu hình kết nối chính. Mở tab "Kết nối chính" trước.' });
      return;
    }

    const blocks = runtimeBlocksForPreset(settings.preset, usePromptStore.getState().blocks);
    if (blocks.length === 0) {
      set({ error: 'Chưa nạp được khối prompt nào.' });
      return;
    }

    const provider = getProvider(cfg.providerId);

    // Hồ sơ cập nhật biến. Chưa cấu hình thì `configuredProfile` trả về `main`
    // và vòng sửa lỗi chạy trên chính kết nối kể chuyện, đúng như trước đây.
    const variablesProfile = configuredProfile('variables');
    const variablesCfg = effectiveConfig(variablesProfile);

    const before = useGameStore.getState().snapshot();
    const action: TurnInput = { kind: 'freeform', text };

    // Bước 1: chụp state TRƯỚC khi lượt chạy — lượt hỏng giữa chừng vẫn undo được.
    undoStack.push(before, text === '' ? '(không nhập gì)' : text);

    inflight = new AbortController();
    set({ running: true, streaming: '', error: null, canUndo: undoStack.canUndo });

    // --- Phần 4: quét lorebook TRƯỚC khi lắp prompt ------------------------
    const pass = get().scanLore(before, text);
    set({ lore: pass, notices: [...get().notices, ...pass.notices] });

    let result: TurnResult;
    try {
      result = await runTurn(before, action, {
        provider,
        cfg,
        variablesProvider: getProvider(variablesCfg.providerId),
        variablesCfg,
        variablesProfile,
        // Entry chèn theo độ sâu đi vào danh sách khối như khối tổng hợp; entry
        // còn lại vào khối 4 qua `lore`.
        blocks: [...blocks, ...pass.depthBlocks],
        lore: pass.items,
        engineOps: pass.ops,
        budget: get().liveBudget(),
        regexScripts: settings.preset?.regexScripts ?? [],
        macroNest: settings.preset?.source.extensions?.SPreset?.MacroNest === true,
        scene: get().scene,
        history: get().entries,
        charName: get().charName,
        counter: providerCounter(provider, cfg),
        signal: inflight.signal,
        onChunk: (chunk) => {
          set((state) => ({ streaming: state.streaming + chunk }));
        },
      });
    } catch (error) {
      set({ running: false, error: `Lượt hỏng: ${String(error)}` });
      return;
    } finally {
      inflight = null;
    }

    // --- Bước 10: chốt --------------------------------------------------
    const store = useGameStore.getState();
    if (result.nextState !== null) store.commitBatch(result.nextState);
    store.commitRng(result.rngAfter);
    store.advanceTurn();

    // --- Bước 8: MÔ PHỎNG NGẦM (Phần 15) --------------------------------
    //
    // Chạy SAU khi lô của AI đã chốt, không phải trước: thế giới ngầm phải phản
    // ứng với cái vừa xảy ra trong lượt này, và một tin tức sinh ra từ một trạng
    // thái đã bị MVU từ chối là một tin về chuyện chưa từng xảy ra.
    //
    // Bước 8 KHÔNG được làm hỏng lượt (R4): người chơi đã đọc đoạn văn rồi, và
    // một lỗi mạng ở tầng mô phỏng không được cướp lại lượt ấy. Mọi thứ ở đây
    // nằm trong `try`, và hỏng thì chỉ mất một dòng nhật ký.
    const tick = await runBackgroundTick(result.record.turn, result.record.outcome.timeCost);
    set({ tickNote: tick.note });

    // Tầng 2 chỉ mở khi AI đã thử sửa và VẪN hỏng. Lô chưa từng bị từ chối,
    // hoặc bị từ chối rồi sửa được, thì không làm phiền người chơi.
    //
    // Modal áp op lên state SAU khi đã chốt lượt, không phải lên `before`. Áp
    // lên `before` thì `commitBatch` sẽ ghi đè cả `meta.turn` lẫn vị trí xúc
    // sắc về lúc chưa tung — nghĩa là lượt sau tung lại đúng con số cũ, và R3
    // vỡ theo cách gần như không ai nhìn ra.
    const committed = useGameStore.getState().snapshot();
    const review: PendingReview | null =
      result.repair !== null && !result.repair.repaired && result.repair.ops.length > 0
        ? {
            state: committed,
            failures: [...result.repair.final.failures],
            ops: [...result.repair.ops],
            record: result.record,
          }
        : null;

    // Lô đang chờ sửa tay CHƯA ghi nhật ký: kết cục của nó còn nằm trong tay
    // người chơi, và ghi bây giờ thì một lượt sẽ có hai dòng mâu thuẫn nhau.
    if (review === null && result.ops.length > 0) {
      recordPatch(result.record.turn, before, result.nextState ?? before, result.ops, false);
    }

    set((state) => ({
      running: false,
      streaming: '',
      last: result,
      error: result.error,
      canUndo: undoStack.canUndo,
      entries: result.entry === null ? state.entries : [...state.entries, result.entry],
      review,
      // Lời mời của lượt TRƯỚC hết hạn ở đây: cảnh đã trôi qua, và một trận đấu
      // được mời từ hai cảnh trước thì không còn chỗ nào trong truyện để nhét vào.
      encounter: result.encounter,
      // Lượt sau so với chỗ này để biết nhân vật có vừa bước sang vùng khác không.
      previousRegionId: currentRegion(useGameStore.getState().snapshot()),
    }));

    // Save vẫn ghi ngay cả khi đang chờ sửa tay: đoạn văn và vị trí xúc sắc của
    // lượt này đã là sự thật rồi, chỉ phần biến là còn treo.
    //
    // Biên bản mang số THẬT của bước 8 (Phần 0 mục 6): `runTurn` dựng nó trước
    // khi mô phỏng ngầm chạy nên hai ô ấy còn là 0, và một biên bản nói lượt này
    // không có biến cố nào trong khi thế giới vừa sinh ra mười hai cái là một
    // biên bản không tra lại được.
    void persist({
      ...result.record,
      tick: { eventCount: tick.eventCount, llmCallsUsed: tick.llmCallsUsed },
    });
  },

  cancel() {
    inflight?.abort();
    set({ running: false });
  },

  undo() {
    const previous = undoStack.undo();
    if (previous === null) return;
    useGameStore.getState().loadState(previous);
    set((state) => ({
      entries: state.entries.slice(0, -1),
      canUndo: undoStack.canUndo,
      last: null,
      error: null,
      review: null,
      encounter: null,
    }));
  },

  resolveReview(result, manualOverride) {
    const pending = get().review;
    if (pending === null || result.next === null) return;

    // `meta` LUÔN lấy theo state đang sống, không lấy theo ảnh chụp mà modal
    // cầm. Modal chỉ sửa những path AI đề xuất — mà `meta.turn` và `meta.rng`
    // thì AI không bao giờ được đụng tới. Ghi đè chúng bằng một ảnh chụp cũ là
    // kéo lượt và vị trí xúc sắc lùi lại, tức là lượt sau tung lại đúng con số
    // cũ: R3 vỡ mà không ai nhìn thấy.
    const live = useGameStore.getState().snapshot();
    const next = { ...result.next, meta: live.meta };

    useGameStore.getState().commitBatch(next);
    recordPatch(pending.record.turn, pending.state, next, pending.ops, manualOverride);

    set({ review: null, error: null });
    void persist({
      ...pending.record,
      patch: { applied: true, opCount: pending.ops.length, rejections: [] },
    });
  },

  acceptEncounter() {
    const offer = get().encounter;
    if (offer === null) return null;

    const snapshot = useGameStore.getState().snapshot();
    const rng = createRngHub(snapshot.meta.seed, snapshot.meta.rng).stream(streamOf(offer.request.kind));
    try {
      const built = buildEncounter(offer, snapshot, rng, snapshot.meta.turn);
      set({ encounter: null, error: null });
      return built;
    } catch (error) {
      // Data hỏng hoặc một id không có thật lọt qua kiểm duyệt: nói ra và bỏ lời
      // mời, chứ không để một ngoại lệ nổ lên giữa lúc người chơi đang đọc (R4).
      set({ encounter: null, error: `Không dựng được trận: ${String(error)}` });
      return null;
    }
  },

  skipEncounter() {
    const offer = get().encounter;
    if (offer === null) return;

    const store = useGameStore.getState();
    const snapshot = store.snapshot();
    const rng = createRngHub(snapshot.meta.seed, snapshot.meta.rng).stream(streamOf(offer.request.kind));

    let outcome: ReturnType<typeof autoResolve>;
    try {
      // Cùng MỘT dòng xúc sắc cho cả dựng lẫn đánh: dựng bằng một dòng rồi đánh
      // bằng dòng khác là hai lần rút từ hai chỗ, và vị trí ghi lại vào save sẽ
      // bỏ quên phần đã rút lúc dựng (R3).
      outcome = autoResolve(buildEncounter(offer, snapshot, rng, snapshot.meta.turn), snapshot, rng);
    } catch (error) {
      set({ encounter: null, error: `Engine không đánh thay được trận này: ${String(error)}` });
      return;
    }

    const applied = applyPatch(snapshot, outcome.ops, { actor: 'engine' });
    if (!applied.applied || applied.next === null) {
      // Lô của engine bị MVU từ chối là bug của engine, không phải AI viết ẩu —
      // nó phải nổi lên. State giữ nguyên, và đoạn kể KHÔNG được viết ra: một
      // đoạn văn nói ngài gãy tay trong khi state nói ngài lành lặn còn tệ hơn
      // là không có đoạn văn nào (R4).
      set({
        encounter: null,
        error: `Không ghi được kết quả trận engine đánh thay: ${applied.failures.map((entry) => entry.message).join('; ')}`,
      });
      return;
    }

    store.commitBatch(applied.next);
    set({ encounter: null, error: null });
    get().logCombat({ summary: outcome.summary, outcome: outcome.outcome }, outcome.ops);
  },

  logCombat(told, engineOps = []) {
    const state = useGameStore.getState().snapshot();
    archiveCombat(told.summary, engineOps);
    set((current) => ({
      entries: [
        ...current.entries,
        {
          turn: state.meta.turn,
          gameDate: state.meta.gameDate,
          // Dòng này đi vào khối 10 (lịch sử gần) của lượt sau, nên AI đọc được
          // rằng trận đánh nó vừa mở ra đã kết thúc thế nào và kể tiếp từ đó.
          action: '(trận đánh)',
          narrative: told.summary,
          outcome: told.outcome,
        },
      ],
    }));
  },

  discardReview() {
    const pending = get().review;
    if (pending !== null) {
      // Ghi lại lô đã bị vứt: `after` bằng `before` chính là bằng chứng lượt
      // này không đổi gì, và đó là thứ cần tra khi về sau state trông lạ.
      recordPatch(pending.record.turn, pending.state, pending.state, pending.ops, false);
    }
    set({ review: null, error: 'Đã bỏ toàn bộ lô cập nhật biến — state giữ nguyên.' });
  },

  setScene(patch) {
    set((state) => ({ scene: { ...state.scene, ...patch } }));
  },

  setBudget(budget) {
    set({ budget });
  },

  liveBudget() {
    return { ...get().budget, ...tokenLimits('main') };
  },

  setCharName(charName) {
    set({ charName });
  },

  /**
   * Một lượt quét, dùng chung cho lượt chơi thật và cho nút "Thử quét".
   *
   * Văn bản đưa vào trình quét gồm hành động lượt này (recency 0) và ba đoạn
   * gần nhất. Quét cả lịch sử xa là entry cũ sống lại vô cớ; quét mỗi hành động
   * là mất hết ngữ cảnh vừa xảy ra.
   */
  scanLore(state, actionText) {
    const books = useLorebookStore.getState().books;
    if (books.length === 0) return emptyLorePass();

    const entries = get().entries;
    const texts: ScanText[] = [
      { text: actionText, recency: 0 },
      ...entries
        .slice(-3)
        .reverse()
        .map((entry, index) => ({ text: `${entry.action}\n${entry.narrative}`, recency: index + 1 })),
    ];

    const input: PromptInput = {
      ...get().promptInput(),
      state,
      action: { kind: 'freeform', text: actionText },
    };

    return runLorePass({
      books,
      state,
      turn: state.meta.turn + 1,
      now: state.meta.gameDate,
      regionId: currentRegion(state),
      previousRegionId: get().previousRegionId,
      texts,
      // Cùng bộ locals mà khối prompt dùng, để `condition` chạy như nhau ở hai chỗ.
      locals: buildPromptLocals(input, 0, get().liveBudget().total),
      // Và cùng bộ macro, để `{{user}}` trong entry nghĩa đúng như trong khối.
      macros: createMacroContext({
        gameDate: state.meta.gameDate,
        user: state.player.name,
        char: get().charName,
        lastMessage: get().entries.at(-1)?.narrative ?? '',
        rng: macroRng(state.meta.seed, state.meta.turn),
        readState: (path) => readPath(state, path),
      }),
      audience: audienceOf(state),
      rng: loreRng(state.meta.seed, state.meta.turn + 1),
      budgetTokens: get().budget.lore ?? DEFAULT_LORE_BUDGET,
    });
  },

  dryRunLore(text) {
    return get().scanLore(useGameStore.getState().snapshot(), text);
  },

  /**
   * Xuất ván chơi ĐANG NHÌN THẤY, không phải bản autosave trên đĩa.
   *
   * Autosave chỉ ghi ở cuối lượt; nếu đọc lại Tầng A thì người bấm Xuất ngay
   * sau khi sửa tay ở modal tầng 2 sẽ nhận về một file cũ hơn màn hình của họ,
   * mà không có gì nói cho họ biết.
   */
  async exportSave() {
    const storage = await openStorage();
    if (storage === null) throw new Error(storageStatus().message);

    await checkpoint(get().activeSlotId);
    const outcome = await storage.exportSave(useGameStore.getState().snapshot(), get().activeSlotId);
    const note = outcome.complete
      ? ''
      : ' Chưa có Tầng B nên file chỉ chứa phần đuôi lịch sử mà Tầng A còn giữ.';
    return `Đã xuất ${outcome.fileName} — ${outcome.turnCount} lượt.${note}`;
  },

  /**
   * Nhập một file. `parseBundle` đã migrate và validate xong mới tới lượt ghi,
   * nên tới được dòng `loadState` nghĩa là state chắc chắn dùng được (R4).
   */
  async importSave() {
    const storage = await openStorage();
    if (storage === null) throw new Error(storageStatus().message);

    const slotId = `import-${Date.now().toString(36)}`;
    const parsed = await storage.importSave(slotId);
    useGameStore.getState().loadState(parsed.bundle.state);
    useGameStore.getState().ensureSlices();

    // Ngăn xếp undo và danh sách cảnh của ván CŨ không còn nghĩa gì với ván vừa
    // nạp — giữ lại là cho phép hoàn tác ngược vào một ván chơi khác.
    undoStack.clear();
    patchLog.clear();
    checkLog.clear();
    set({
      activeSlotId: slotId,
      entries: entriesFromTurns(parsed.bundle.turns),
      last: null,
      error: null,
      canUndo: false,
      review: null,
      encounter: null,
      lore: emptyLorePass(),
      notices: [],
      previousRegionId: currentRegion(useGameStore.getState().snapshot()),
    });

    await saveCampaignSession(slotId, campaignSessionOf(get()));
    await saveActiveSlot(slotId);
    bindArchiveSlot(slotId);
    await get().refreshSlots();

    const warnings = parsed.warnings.length === 0 ? '' : ` ${parsed.warnings.join(' ')}`;
    return `Đã nạp ván chơi: lượt ${parsed.bundle.state.meta.turn}, ${parsed.bundle.turns.length} biên bản.${warnings}`;
  },
}));

// Autosave cả những thay đổi không đi qua một lượt AI: chốt nhân vật, trang bị,
// trị thương, cài cảnh… Đây là phần trước kia khiến F5 sau khi tạo nhân vật vẫn
// quay lại trình tạo vì state chỉ được ghi ở cuối lượt.
let checkpointTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleCheckpoint(): void {
  const turn = useTurnStore.getState();
  if (!turn.booted || turn.slots.length === 0) return;
  if (checkpointTimer !== null) clearTimeout(checkpointTimer);
  checkpointTimer = setTimeout(() => {
    checkpointTimer = null;
    void checkpoint(useTurnStore.getState().activeSlotId);
  }, 250);
}

useGameStore.subscribe(() => scheduleCheckpoint());
useTurnStore.subscribe((state, previous) => {
  if (
    state.entries !== previous.entries ||
    state.scene !== previous.scene ||
    state.budget !== previous.budget ||
    state.charName !== previous.charName ||
    state.tickNote !== previous.tickNote ||
    state.previousRegionId !== previous.previousRegionId
  ) {
    scheduleCheckpoint();
  }
});

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && useTurnStore.getState().booted) {
      void checkpoint(useTurnStore.getState().activeSlotId);
    }
  });
}
