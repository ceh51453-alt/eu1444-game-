/**
 * Cài đặt ứng dụng: hai hồ sơ kết nối, preset đang dùng, tuỳ chọn script.
 *
 * KHÔNG PHẢI GameState. Không đi qua MVU, không nằm trong save của ván chơi,
 * không bao giờ có mặt trong file export — vì nó chứa mật khẩu proxy.
 *
 * Hai hồ sơ TÁCH RỜI HOÀN TOÀN (Phần 1 mục 5): provider, URL, mật khẩu, model,
 * preset đều độc lập. "main" viết diễn biến; "worldtick" chạy mô phỏng ngầm và
 * sẽ bị gọi rất nhiều lần, nên gần như chắc chắn dùng model rẻ hơn.
 */

import { create } from 'zustand';
import { z } from 'zod';
import { DEFAULT_TIMEOUT_MS, MAX_MODEL_TIMEOUT_MS } from '@/ai/http';
import {
  DEFAULT_CUSTOM_TRANSPORT,
  DEFAULT_MAX_INPUT_TOKENS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  getProvider,
  PROFILE_IDS,
  type ConnCfg,
  type ModelInfo,
  type ProfileId,
  type ProviderId,
} from '@/ai/provider';
import { tuneFromPreset } from '@/ai/preset/params';
import { importSillyTavernPreset, type GamePreset, type ImportReport } from '@/ai/preset/import';
import type { RegexScript } from '@/ai/regex/runner';
import { scriptHost } from '@/ai/scripts/host';
import { loadSettings, saveSettings, settingsAvailable } from '@/persist/settings';

/**
 * 4 — nâng timeout model mặc định lên 10 phút và trần lên 30 phút.
 * Bản cũ đọc lên vẫn dùng được: `hydrate` vá phần thiếu thay vì vứt cả file đi.
 */
export const SETTINGS_VERSION = 4;

/** Cảnh báo bắt buộc hiện cạnh ô mật khẩu (Phần 1 mục 8). */
export const PASSWORD_WARNING =
  'Lưu cục bộ trên máy này, không mã hóa mạnh — đừng dùng trên máy chung.';

const customTransportSchema = z.object({
  chatPath: z.string(),
  modelsPath: z.string(),
  authHeader: z.string(),
  authPrefix: z.string(),
  extraHeaders: z.string(),
  extraBody: z.string(),
});

const connCfgSchema = z.object({
  providerId: z.enum(['openai', 'gemini', 'anthropic', 'custom']),
  baseUrl: z.string(),
  password: z.string(),
  model: z.string(),
  params: z.record(z.string(), z.unknown()),
  timeoutMs: z.number().int().min(1000).max(MAX_MODEL_TIMEOUT_MS),
  // Optional: hồ sơ ghi bằng bản 1 chưa có mấy trường này.
  stream: z.boolean().optional(),
  maxInputTokens: z.number().int().min(1000).max(20000000).optional(),
  maxOutputTokens: z.number().int().min(64).max(2000000).optional(),
  custom: customTransportSchema.optional(),
});

/**
 * Giá token do người dùng tự nhập. Engine không thể biết proxy tính giá bao
 * nhiêu, nên chi phí ước tính ở tab Debug chỉ đúng khi hai số này đúng.
 */
const pricingSchema = z.object({
  inPerMTok: z.number().min(0),
  outPerMTok: z.number().min(0),
});

export type Pricing = z.infer<typeof pricingSchema>;

/**
 * Hồ sơ `variables` là `.optional()`: bản 1 trên đĩa chỉ có hai hồ sơ, và bắt
 * buộc nó ở đây nghĩa là mọi người chơi cũ mất sạch cài đặt sau khi cập nhật.
 */
const persistedSchema = z.object({
  version: z.number().int(),
  profiles: z.object({
    main: connCfgSchema,
    worldtick: connCfgSchema,
    variables: connCfgSchema.optional(),
  }),
  pricing: z.object({
    main: pricingSchema,
    worldtick: pricingSchema,
    variables: pricingSchema.optional(),
  }),
  useDevProxy: z.boolean(),
  scriptTimeoutMs: z.number().int().min(100).max(120000),
  scriptTimeoutEnabled: z.boolean(),
  // Preset có thể rất lớn và có nhiều trường mở rộng của SillyTavern. Giữ nó
  // ở dạng unknown tại mép lưu trữ rồi nạp lại qua schema chính thức bên dưới.
  preset: z.unknown().optional(),
});

export type PersistedSettings = z.infer<typeof persistedSchema>;

function blankProfile(providerId: ProviderId): ConnCfg {
  return {
    providerId,
    baseUrl: '',
    password: '',
    model: '',
    params: { ...getProvider(providerId).defaultParams },
    timeoutMs: DEFAULT_TIMEOUT_MS,
    stream: true,
    maxInputTokens: DEFAULT_MAX_INPUT_TOKENS,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    custom: { ...DEFAULT_CUSTOM_TRANSPORT },
  };
}

/**
 * Một hồ sơ đọc từ đĩa lên, vá đủ những trường bản 1 chưa có.
 * `undefined` (hồ sơ chưa từng tồn tại) trả về một hồ sơ trống.
 */
function restoreProfile(stored: z.infer<typeof connCfgSchema> | undefined, storedVersion = SETTINGS_VERSION): ConnCfg {
  if (stored === undefined) return blankProfile('openai');
  return {
    providerId: stored.providerId,
    baseUrl: stored.baseUrl,
    password: stored.password,
    model: stored.model,
    params: stored.params,
    // Bản cũ dùng đúng mặc định 120 giây thì nâng theo mặc định mới. Giá trị
    // khác là lựa chọn có chủ ý của người chơi nên giữ nguyên.
    timeoutMs: storedVersion < 4 && stored.timeoutMs === 120000 ? DEFAULT_TIMEOUT_MS : stored.timeoutMs,
    stream: stored.stream ?? true,
    maxInputTokens: stored.maxInputTokens ?? DEFAULT_MAX_INPUT_TOKENS,
    maxOutputTokens: stored.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    custom: { ...DEFAULT_CUSTOM_TRANSPORT, ...stored.custom },
  };
}

export interface ProfileRuntime {
  /** Model quét được lần gần nhất. */
  models: ModelInfo[];
  scanning: boolean;
  /** Kết quả nút "Kiểm tra kết nối". */
  lastCheck: { ok: boolean; latencyMs: number; message: string } | null;
  /**
   * `thoughtSignature` của Gemini, giữ giữa các lượt.
   * Thiếu nó là 400 ở mọi lượt sau (Phần 1 mục 3.2c).
   */
  thoughtSignature: string | null;
}

function blankRuntime(): ProfileRuntime {
  return { models: [], scanning: false, lastCheck: null, thoughtSignature: null };
}

export interface SettingsState {
  profiles: Record<ProfileId, ConnCfg>;
  pricing: Record<ProfileId, Pricing>;
  runtime: Record<ProfileId, ProfileRuntime>;
  /** Gọi qua đường proxy của Vite dev server thay vì gọi thẳng (mục 4a). */
  useDevProxy: boolean;
  scriptTimeoutMs: number;
  scriptTimeoutEnabled: boolean;
  preset: GamePreset | null;
  presetReport: ImportReport | null;
  loaded: boolean;
}

export interface SettingsActions {
  setProvider(profile: ProfileId, providerId: ProviderId): void;
  patchProfile(profile: ProfileId, patch: Partial<ConnCfg>): void;
  setParam(profile: ProfileId, key: string, value: unknown): void;
  /** Xóa hẳn một tham số khỏi hồ sơ — khác với đặt nó bằng 0 (xem `ParamSpec.optional`). */
  clearParam(profile: ProfileId, key: string): void;
  setCustomTransport(profile: ProfileId, patch: Partial<NonNullable<ConnCfg['custom']>>): void;
  /** Nút "Sao chép cấu hình từ …" — dùng cho cả hồ sơ phụ lẫn hồ sơ biến. */
  copyProfile(from: ProfileId, to: ProfileId): void;
  setModels(profile: ProfileId, models: ModelInfo[]): void;
  setScanning(profile: ProfileId, scanning: boolean): void;
  setLastCheck(profile: ProfileId, check: ProfileRuntime['lastCheck']): void;
  setThoughtSignature(profile: ProfileId, signature: string | null): void;
  setPricing(profile: ProfileId, pricing: Pricing): void;
  setUseDevProxy(value: boolean): void;
  setScriptTimeout(ms: number, enabled: boolean): void;
  setPreset(preset: GamePreset | null, report: ImportReport | null): void;
  /**
   * Áp tham số cấp cao nhất của preset vào một hồ sơ kết nối, kể cả hai trần
   * token. Trả về đúng hai con số đó để người gọi đồng bộ ngân sách prompt.
   */
  applyPresetTuning(
    profile: ProfileId,
  ): { input?: number; output?: number; applied: string[]; ignored: string[] } | null;
  /** Bật/tắt một khối prompt. Khối [LOCKED] bị chặn cứng ở đây, không chỉ ẩn nút. */
  toggleBlock(blockId: string, enabled: boolean): void;
  /** Kéo thả thứ tự khối. Khối [LOCKED] không được kéo ra khỏi vị trí. */
  moveBlock(blockId: string, toIndex: number): boolean;
  /** Bật/tắt một regex của preset. Regex bị từ chối thì không bật lại được. */
  toggleRegex(scriptId: string, enabled: boolean): void;
  hydrate(): Promise<void>;
  persist(): Promise<void>;
}

export type SettingsStore = SettingsState & SettingsActions;

function initialState(): SettingsState {
  return {
    profiles: {
      main: blankProfile('openai'),
      worldtick: blankProfile('openai'),
      variables: blankProfile('openai'),
    },
    pricing: {
      main: { inPerMTok: 0, outPerMTok: 0 },
      worldtick: { inPerMTok: 0, outPerMTok: 0 },
      variables: { inPerMTok: 0, outPerMTok: 0 },
    },
    runtime: { main: blankRuntime(), worldtick: blankRuntime(), variables: blankRuntime() },
    useDevProxy: false,
    scriptTimeoutMs: 3000,
    scriptTimeoutEnabled: true,
    preset: null,
    presetReport: null,
    loaded: false,
  };
}

/** Chỉ những thứ được phép ghi xuống đĩa. Preset lưu riêng vì có thể rất lớn. */
function toPersisted(state: SettingsState): PersistedSettings {
  return {
    version: SETTINGS_VERSION,
    profiles: state.profiles,
    pricing: state.pricing,
    useDevProxy: state.useDevProxy,
    scriptTimeoutMs: state.scriptTimeoutMs,
    scriptTimeoutEnabled: state.scriptTimeoutEnabled,
    preset: state.preset,
  };
}

function restorePreset(raw: unknown): { preset: GamePreset; report: ImportReport } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const stored = raw as { name?: unknown; source?: unknown; blocks?: unknown; regexScripts?: unknown };
  if (stored.source === undefined) return null;

  const imported = importSillyTavernPreset(
    stored.source,
    typeof stored.name === 'string' && stored.name.trim() !== '' ? stored.name : 'preset',
  );

  // Giữ các nút bật/tắt và thứ tự người chơi đã chỉnh ở phiên trước, nhưng
  // luôn tái dựng nội dung qua importer để file cũ/hỏng không lọt vào runtime.
  if (Array.isArray(stored.blocks)) {
    const saved = stored.blocks.filter(
      (item): item is { id: string; enabled?: boolean } =>
        typeof item === 'object' && item !== null && typeof (item as { id?: unknown }).id === 'string',
    );
    const byId = new Map(imported.preset.blocks.map((block) => [block.id, block] as const));
    const ordered = saved
      .map((block) => {
        const fresh = byId.get(block.id);
        if (fresh === undefined) return null;
        byId.delete(block.id);
        return fresh.locked || typeof block.enabled !== 'boolean'
          ? fresh
          : { ...fresh, enabled: block.enabled };
      })
      .filter((block): block is NonNullable<typeof block> => block !== null);
    imported.preset.blocks = [...ordered, ...byId.values()];
  }

  if (Array.isArray(stored.regexScripts)) {
    const enabled = new Map(
      stored.regexScripts
        .filter(
          (item): item is { id: string; enabled: boolean } =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as { id?: unknown }).id === 'string' &&
            typeof (item as { enabled?: unknown }).enabled === 'boolean',
        )
        .map((item) => [item.id, item.enabled] as const),
    );
    imported.preset.regexScripts = imported.preset.regexScripts.map((script) =>
      script.rejected === undefined && enabled.has(script.id)
        ? { ...script, enabled: enabled.get(script.id) ?? script.enabled }
        : script,
    );
  }

  return imported;
}

export const useSettingsStore = create<SettingsStore>()((set, get) => ({
  ...initialState(),

  setProvider(profile, providerId) {
    set((state) => ({
      profiles: {
        ...state.profiles,
        [profile]: {
          ...state.profiles[profile],
          providerId,
          // Tham số của provider cũ vô nghĩa với provider mới.
          params: { ...getProvider(providerId).defaultParams },
          model: '',
        },
      },
      runtime: { ...state.runtime, [profile]: { ...state.runtime[profile], models: [], lastCheck: null } },
    }));
  },

  patchProfile(profile, patch) {
    set((state) => ({
      profiles: { ...state.profiles, [profile]: { ...state.profiles[profile], ...patch } },
    }));
  },

  setParam(profile, key, value) {
    set((state) => ({
      profiles: {
        ...state.profiles,
        [profile]: {
          ...state.profiles[profile],
          params: { ...state.profiles[profile].params, [key]: value },
        },
      },
    }));
  },

  clearParam(profile, key) {
    set((state) => {
      // Xóa khóa thật, không đặt `undefined`: `pickParams` bỏ qua undefined nên
      // hai cách cho ra cùng một request, nhưng khóa còn nằm đó thì UI vẫn thấy
      // ô tick đang bật và người chơi không hiểu vì sao tắt không được.
      const { [key]: _dropped, ...rest } = state.profiles[profile].params;
      return {
        profiles: { ...state.profiles, [profile]: { ...state.profiles[profile], params: rest } },
      };
    });
  },

  setCustomTransport(profile, patch) {
    set((state) => ({
      profiles: {
        ...state.profiles,
        [profile]: {
          ...state.profiles[profile],
          custom: {
            ...DEFAULT_CUSTOM_TRANSPORT,
            ...state.profiles[profile].custom,
            ...patch,
          },
        },
      },
    }));
  },

  copyProfile(from, to) {
    if (from === to) return;
    set((state) => ({
      profiles: {
        ...state.profiles,
        [to]: {
          ...state.profiles[from],
          params: { ...state.profiles[from].params },
          ...(state.profiles[from].custom === undefined
            ? {}
            : { custom: { ...state.profiles[from].custom } }),
        },
      },
      runtime: { ...state.runtime, [to]: { ...blankRuntime(), models: state.runtime[from].models } },
    }));
  },

  setModels(profile, models) {
    set((state) => ({
      runtime: { ...state.runtime, [profile]: { ...state.runtime[profile], models, scanning: false } },
    }));
  },

  setScanning(profile, scanning) {
    set((state) => ({
      runtime: { ...state.runtime, [profile]: { ...state.runtime[profile], scanning } },
    }));
  },

  setLastCheck(profile, lastCheck) {
    set((state) => ({
      runtime: { ...state.runtime, [profile]: { ...state.runtime[profile], lastCheck } },
    }));
  },

  setThoughtSignature(profile, thoughtSignature) {
    set((state) => ({
      runtime: { ...state.runtime, [profile]: { ...state.runtime[profile], thoughtSignature } },
    }));
  },

  setPricing(profile, pricing) {
    set((state) => ({ pricing: { ...state.pricing, [profile]: pricing } }));
  },

  setUseDevProxy(useDevProxy) {
    set({ useDevProxy });
  },

  setScriptTimeout(scriptTimeoutMs, scriptTimeoutEnabled) {
    set({ scriptTimeoutMs, scriptTimeoutEnabled });
  },

  setPreset(preset, presetReport) {
    set({ preset, presetReport });
    void get().persist();
  },

  applyPresetTuning(profile) {
    const preset = get().preset;
    if (preset === null) return null;

    const cfg = get().profiles[profile];
    const tuning = tuneFromPreset(preset.source, cfg.providerId);

    set((state) => ({
      profiles: {
        ...state.profiles,
        [profile]: {
          ...state.profiles[profile],
          params: { ...state.profiles[profile].params, ...tuning.params },
          ...(tuning.stream === undefined ? {} : { stream: tuning.stream }),
          ...(tuning.tokens.input === undefined ? {} : { maxInputTokens: tuning.tokens.input }),
          ...(tuning.tokens.output === undefined ? {} : { maxOutputTokens: tuning.tokens.output }),
        },
      },
    }));

    return {
      ...(tuning.tokens.input === undefined ? {} : { input: tuning.tokens.input }),
      ...(tuning.tokens.output === undefined ? {} : { output: tuning.tokens.output }),
      applied: tuning.applied,
      ignored: tuning.ignored,
    };
  },

  toggleBlock(blockId, enabled) {
    const preset = get().preset;
    if (preset === null) return;
    const blocks = preset.blocks.map((block) =>
      // Chặn cứng: khối [LOCKED] không tắt được, dù UI có gọi tới đây.
      block.id === blockId && !block.locked ? { ...block, enabled } : block,
    );
    set({ preset: { ...preset, blocks } });
    void get().persist();
  },

  moveBlock(blockId, toIndex) {
    const preset = get().preset;
    if (preset === null) return false;
    const from = preset.blocks.findIndex((block) => block.id === blockId);
    if (from === -1) return false;

    const moving = preset.blocks[from];
    if (moving === undefined || moving.locked) return false;

    const target = Math.max(0, Math.min(preset.blocks.length - 1, toIndex));
    const destination = preset.blocks[target];
    // Không cho thả vào đúng chỗ của một khối [LOCKED] — vị trí của chúng là
    // một phần của hợp đồng với Phần 2 và Phần 3.
    if (destination !== undefined && destination.locked) return false;

    const blocks = [...preset.blocks];
    blocks.splice(from, 1);
    blocks.splice(target, 0, moving);
    set({ preset: { ...preset, blocks } });
    void get().persist();
    return true;
  },

  toggleRegex(scriptId, enabled) {
    const preset = get().preset;
    if (preset === null) return;
    const regexScripts: RegexScript[] = preset.regexScripts.map((script) =>
      // Mẫu bị từ chối thì không có nút bật: bật lên nghĩa là cho một regex có
      // nguy cơ treo UI chạy trên luồng chính (`regex/runner.ts`).
      script.id === scriptId && script.rejected === undefined ? { ...script, enabled } : script,
    );
    set({ preset: { ...preset, regexScripts } });
    void get().persist();
  },

  async hydrate() {
    if (!settingsAvailable()) {
      set({ loaded: true });
      return;
    }
    const raw = await loadSettings();
    const parsed = persistedSchema.safeParse(raw);
    if (parsed.success) {
      // Bản 1 không có hồ sơ `variables`: dựng nó rỗng thay vì bỏ cả file cài
      // đặt đi. Mất mật khẩu proxy vì một lần cập nhật là cái giá quá đắt.
      const stored = parsed.data;
      let restoredPreset: { preset: GamePreset; report: ImportReport } | null = null;
      try {
        restoredPreset = restorePreset(stored.preset);
      } catch {
        // Preset hỏng không được làm mất cấu hình kết nối. Người chơi vẫn vào
        // được game và có thể nạp lại preset ở tab tương ứng.
      }
      const profiles = {
        main: restoreProfile(stored.profiles.main, stored.version),
        worldtick: restoreProfile(stored.profiles.worldtick, stored.version),
        variables: restoreProfile(stored.profiles.variables, stored.version),
      };
      set({
        profiles,
        pricing: {
          main: stored.pricing.main,
          worldtick: stored.pricing.worldtick,
          variables: stored.pricing.variables ?? { inPerMTok: 0, outPerMTok: 0 },
        },
        useDevProxy: stored.useDevProxy,
        scriptTimeoutMs: stored.scriptTimeoutMs,
        scriptTimeoutEnabled: stored.scriptTimeoutEnabled,
        preset: restoredPreset?.preset ?? null,
        presetReport: restoredPreset?.report ?? null,
        loaded: true,
      });
      if (restoredPreset !== null) scriptHost.load(restoredPreset.preset.helperScripts);
    } else {
      set({ loaded: true });
    }
  },

  async persist() {
    if (!settingsAvailable()) return;
    await saveSettings(toPersisted(get()));
  },
}));

/**
 * Địa chỉ thật sẽ gọi. Khi bật proxy dev, mọi request đi qua đường
 * `/llm-proxy` của Vite để tránh CORS lúc phát triển (Phần 1 mục 4a).
 */
export const DEV_PROXY_PREFIX = '/llm-proxy';

export function effectiveConfig(profile: ProfileId): ConnCfg {
  const state = useSettingsStore.getState();
  const cfg = state.profiles[profile];
  if (!state.useDevProxy) return cfg;
  return { ...cfg, baseUrl: DEV_PROXY_PREFIX };
}

/**
 * Ngân sách token của một hồ sơ.
 *
 * Hai trần token sống trên HỒ SƠ, không sống trong store lượt: chúng thuộc về
 * model đang chọn, và người chơi đổi từ một model 128k sang một model 2M thì cả
 * hai con số phải đổi theo cùng lúc với việc đổi model. Store lượt chỉ giữ trần
 * riêng của lorebook, thứ không dính gì tới nhà cung cấp.
 */
export function tokenLimits(profile: ProfileId): { total: number; reserveForOutput: number } {
  const cfg = useSettingsStore.getState().profiles[profile];
  return {
    total: cfg.maxInputTokens ?? DEFAULT_MAX_INPUT_TOKENS,
    reserveForOutput: cfg.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
  };
}

/** Hồ sơ đã điền đủ để gọi được. */
export function profileReady(profile: ProfileId): boolean {
  const cfg = useSettingsStore.getState().profiles[profile];
  return cfg.baseUrl.trim() !== '' && cfg.model.trim() !== '';
}

/**
 * Hồ sơ THẬT SỰ sẽ chạy cho một việc.
 *
 * `variables` và `worldtick` đều được phép để trống, và để trống là một lựa
 * chọn hợp lệ chứ không phải lỗi cấu hình: người chơi chỉ muốn một kết nối thì
 * mọi thứ chạy trên `main`. Rơi về `main` ở ĐÂY, một chỗ, thay vì mỗi nơi gọi
 * tự đoán lấy — hai chỗ đoán khác nhau là hai chỗ sẽ lệch nhau.
 */
export function configuredProfile(preferred: ProfileId): ProfileId {
  return profileReady(preferred) ? preferred : 'main';
}

export const PROFILES = PROFILE_IDS;
