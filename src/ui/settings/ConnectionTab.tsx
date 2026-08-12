/**
 * Tab Kết nối (Phần 1 mục 7).
 *
 * Dùng chung cho cả BA hồ sơ: "main" viết diễn biến, "worldtick" chạy mô phỏng
 * ngầm, "variables" chạy vòng cập nhật/sửa biến của Phần 2. Ba hồ sơ độc lập
 * hoàn toàn, nên đây là cùng một component với `profile` khác nhau, không phải
 * ba bản sao — sửa một chỗ thì cả ba cùng đúng.
 */

import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  getProvider,
  checkConnection,
  allProviders,
  DEFAULT_CUSTOM_TRANSPORT,
  DEFAULT_MAX_INPUT_TOKENS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  PROFILE_LABELS,
  type ModelInfo,
  type ParamSpec,
  type ProfileId,
  type ProviderId,
} from '@/ai/provider';
import { probeCustomTransport } from '@/ai/providers/custom';
import { LlmError } from '@/ai/errors';
import { DEV_PROXY_PREFIX, effectiveConfig, PASSWORD_WARNING, useSettingsStore } from '@/state/settings';
import { Button, Field, PasswordInput, Select, TextInput, Warning } from './controls';

/** Trần thật của model đang chọn, khi lần quét gần nhất có nói. */
function limitsFor(models: readonly ModelInfo[], modelId: string): ModelInfo | undefined {
  return models.find((model) => model.id === modelId);
}

/**
 * Trần trên của một thanh trượt, sau khi đối chiếu với model đang chọn.
 *
 * Đây là chỗ sửa lỗi "đầu ra 65k bị hiểu thành 2 triệu": `boundBy: 'maxOutput'`
 * nói rằng tham số này bị chặn bởi TRẦN ĐẦU RA của model, không phải bởi cửa sổ
 * ngữ cảnh — hai con số hoàn toàn khác nhau và chỉ có một cái đúng ở đây.
 */
function effectiveMax(spec: ParamSpec, model: ModelInfo | undefined): number | undefined {
  if (spec.boundBy === undefined || model === undefined) return spec.max;
  const bound = spec.boundBy === 'maxOutput' ? model.maxOutput : model.contextWindow;
  if (bound === undefined) return spec.max;
  return spec.max === undefined ? bound : Math.min(spec.max, bound);
}

function ParamControl({
  profile,
  spec,
  model,
}: {
  profile: ProfileId;
  spec: ParamSpec;
  model: ModelInfo | undefined;
}): ReactNode {
  const cfg = useSettingsStore((state) => state.profiles[profile]);
  const setParam = useSettingsStore((state) => state.setParam);
  const clearParam = useSettingsStore((state) => state.clearParam);
  const provider = getProvider(cfg.providerId);
  const paramKey = spec.key;

  const disabled = provider.unsupportedParams(cfg.model).includes(paramKey);
  const present = Object.prototype.hasOwnProperty.call(cfg.params, paramKey);
  const value = cfg.params[paramKey];

  /*
    Tham số ngoài chuẩn (`min_p`, `top_a`, `n`…) có một ô tick riêng: gửi chúng
    lên một proxy không hiểu là ăn 400, nên "không gửi" phải là một trạng thái
    NHÌN THẤY ĐƯỢC, khác hẳn với "gửi giá trị 0".
  */
  const optIn =
    spec.optional !== true ? null : (
      <label className="flex items-center gap-2 text-xs text-vellum/50">
        <input
          type="checkbox"
          checked={present}
          onChange={(event) => {
            if (event.target.checked) setParam(profile, paramKey, spec.default);
            else clearParam(profile, paramKey);
          }}
        />
        gửi tham số này
      </label>
    );

  if (spec.optional === true && !present) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-vellum/40">{spec.label}</span>
        {optIn}
      </div>
    );
  }

  if (spec.kind === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          disabled={disabled}
          checked={value === true}
          onChange={(event) => setParam(profile, paramKey, event.target.checked)}
        />
        <span className={disabled ? 'text-vellum/30' : 'text-vellum/70'}>{spec.label}</span>
      </label>
    );
  }

  if (spec.kind === 'enum') {
    return (
      <Field label={spec.label} {...(spec.help === undefined ? {} : { hint: spec.help })}>
        <Select
          disabled={disabled}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => setParam(profile, paramKey, event.target.value)}
        >
          {(spec.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
        {optIn}
      </Field>
    );
  }

  if (spec.kind === 'stringList') {
    const list = Array.isArray(value) ? value.join('\n') : '';
    return (
      <Field label={spec.label} hint="Mỗi dòng một chuỗi.">
        <textarea
          disabled={disabled}
          rows={2}
          value={list}
          onChange={(event) =>
            setParam(
              profile,
              paramKey,
              event.target.value.split('\n').filter((line) => line !== ''),
            )
          }
          className="w-full resize-y rounded border border-oak-light bg-ink px-2 py-1.5 text-sm text-parchment disabled:opacity-40"
        />
      </Field>
    );
  }

  const numeric = typeof value === 'number' ? value : 0;
  const max = effectiveMax(spec, model);
  const capped = max !== undefined && numeric > max;
  const bound =
    spec.boundBy === 'maxOutput'
      ? 'trần đầu ra của model'
      : spec.boundBy === 'contextWindow'
        ? 'cửa sổ ngữ cảnh của model'
        : null;

  return (
    <Field
      label={`${spec.label}${disabled ? ' — model này bỏ qua' : ''}`}
      {...(spec.help === undefined ? {} : { hint: spec.help })}
    >
      <div className="flex items-center gap-2">
        {spec.min !== undefined && max !== undefined && (
          <input
            type="range"
            disabled={disabled}
            min={spec.min}
            max={max}
            step={spec.step ?? 1}
            value={Math.min(numeric, max)}
            onChange={(event) => setParam(profile, paramKey, Number(event.target.value))}
            className="flex-1 accent-brass disabled:opacity-30"
          />
        )}
        <TextInput
          type="number"
          disabled={disabled}
          step={spec.step ?? 1}
          value={numeric}
          onChange={(event) => setParam(profile, paramKey, Number(event.target.value))}
          className="w-24"
        />
      </div>
      {optIn}
      {bound !== null && max !== undefined && max !== spec.max && (
        <span className="text-xs text-vellum/40">Model đang chọn: tối đa {max} ({bound}).</span>
      )}
      {capped && max !== undefined && (
        <Warning level="warn">
          {numeric} vượt {bound ?? 'trần'} ({max}). Nhà cung cấp gần như chắc chắn trả 400 — hạ xuống {max}.
        </Warning>
      )}
    </Field>
  );
}

/**
 * Hai trần token, và chúng phải đứng CẠNH NHAU.
 *
 * Đây là chỗ hay nhầm nhất trong cả bảng cài đặt: một model nhận 2.000.000 token
 * vào mà chỉ sinh ra được 65.000. Để chúng ở hai màn hình khác nhau — hoặc tệ
 * hơn, gộp thành một ô "max tokens" — là bảo đảm sẽ có người điền 2 triệu vào ô
 * đầu ra rồi không hiểu vì sao mọi lượt đều trả 400.
 */
function TokenLimits({ profile, model }: { profile: ProfileId; model: ModelInfo | undefined }): ReactNode {
  const cfg = useSettingsStore((state) => state.profiles[profile]);
  const store = useSettingsStore.getState();

  const input = cfg.maxInputTokens ?? DEFAULT_MAX_INPUT_TOKENS;
  const output = cfg.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;

  const overInput = model?.contextWindow !== undefined && input > model.contextWindow;
  const overOutput = model?.maxOutput !== undefined && output > model.maxOutput;
  // Trần đầu ra bị trừ thẳng khỏi ngân sách prompt (`promptLimit`), nên nó lớn
  // hơn cửa sổ ngữ cảnh nghĩa là prompt còn số âm token và lượt nào cũng hỏng.
  const swapped = output >= input;

  return (
    <div className="flex flex-col gap-2 rounded border border-oak-light bg-ink/40 p-2">
      <p className="text-xs tracking-[0.2em] text-brass uppercase">Giới hạn token</p>

      <div className="grid grid-cols-2 gap-2">
        <Field
          label="Vào — cửa sổ ngữ cảnh"
          hint={
            model?.contextWindow === undefined
              ? 'Ngân sách prompt cắt theo con số này.'
              : `Model: ${model.contextWindow.toLocaleString('vi-VN')}`
          }
        >
          <TextInput
            type="number"
            min={1000}
            step={1000}
            value={input}
            onChange={(event) =>
              store.patchProfile(profile, { maxInputTokens: Math.max(1000, Number(event.target.value)) })
            }
            onBlur={() => void store.persist()}
          />
        </Field>
        <Field
          label="Ra — trần sinh ra"
          hint={
            model?.maxOutput === undefined
              ? 'Cũng là max_tokens gửi lên nhà cung cấp.'
              : `Model: ${model.maxOutput.toLocaleString('vi-VN')}`
          }
        >
          <TextInput
            type="number"
            min={64}
            step={256}
            value={output}
            onChange={(event) =>
              store.patchProfile(profile, { maxOutputTokens: Math.max(64, Number(event.target.value)) })
            }
            onBlur={() => void store.persist()}
          />
        </Field>
      </div>

      {(model?.contextWindow !== undefined || model?.maxOutput !== undefined) && (
        <Button
          onClick={() => {
            store.patchProfile(profile, {
              ...(model.contextWindow === undefined ? {} : { maxInputTokens: model.contextWindow }),
              ...(model.maxOutput === undefined ? {} : { maxOutputTokens: model.maxOutput }),
            });
            void store.persist();
          }}
        >
          Lấy đúng trần của model đang chọn
        </Button>
      )}

      {overInput && model?.contextWindow !== undefined && (
        <Warning level="warn">
          Cửa sổ ngữ cảnh vượt trần model ({model.contextWindow.toLocaleString('vi-VN')}). Prompt sẽ bị
          nhà cung cấp cắt hoặc từ chối.
        </Warning>
      )}
      {overOutput && model?.maxOutput !== undefined && (
        <Warning level="warn">
          Trần sinh ra vượt trần model ({model.maxOutput.toLocaleString('vi-VN')}). Gần như chắc chắn
          trả 400 — đây đúng là chỗ dễ điền nhầm con số của ĐẦU VÀO.
        </Warning>
      )}
      {swapped && (
        <Warning level="warn">
          Trần sinh ra ≥ cửa sổ ngữ cảnh. Phần chừa cho đầu ra bị trừ khỏi ngân sách prompt, nên prompt
          sẽ không còn token nào. Hai ô này có phải đang bị đảo cho nhau không?
        </Warning>
      )}
      {profile === 'main' && (
        <p className="text-[11px] text-vellum/40">
          Hồ sơ chính: hai con số này CHÍNH LÀ ngân sách token của Prompt Manager.
        </p>
      )}
    </div>
  );
}

/** Ô cấu hình riêng của provider `custom` — chỉ để gỡ khi tự dò không ra. */
function CustomTransportFields({ profile }: { profile: ProfileId }): ReactNode {
  const cfg = useSettingsStore((state) => state.profiles[profile]);
  const store = useSettingsStore.getState();
  const transport = { ...DEFAULT_CUSTOM_TRANSPORT, ...cfg.custom };

  const patch = (key: keyof typeof transport, value: string): void => {
    store.setCustomTransport(profile, { [key]: value });
  };

  return (
    <details className="rounded border border-oak-light bg-ink/40 p-2">
      <summary className="cursor-pointer text-xs tracking-[0.2em] text-brass uppercase">
        Nâng cao — endpoint và header
      </summary>
      <p className="mt-2 text-xs text-vellum/50">
        Để TRỐNG là engine tự dò: nó thử <code>/chat/completions</code>, <code>/v1/chat/completions</code>,{' '}
        <code>/api/v1/…</code> với header <code>Authorization: Bearer</code> rồi <code>x-api-key</code>,
        và nhớ lại chỗ nào trả lời. Chỉ điền khi proxy nằm ở một chỗ nó không đoán ra.
      </p>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Field label="Đường dẫn chat">
          <TextInput
            value={transport.chatPath}
            placeholder="/chat/completions"
            onChange={(event) => patch('chatPath', event.target.value)}
            onBlur={() => void store.persist()}
          />
        </Field>
        <Field label="Đường dẫn quét model">
          <TextInput
            value={transport.modelsPath}
            placeholder="/models"
            onChange={(event) => patch('modelsPath', event.target.value)}
            onBlur={() => void store.persist()}
          />
        </Field>
        <Field label="Header xác thực">
          <TextInput
            value={transport.authHeader}
            placeholder="Authorization"
            onChange={(event) => patch('authHeader', event.target.value)}
            onBlur={() => void store.persist()}
          />
        </Field>
        <Field label="Tiền tố" hint="ví dụ 'Bearer ' — nhớ dấu cách cuối">
          <TextInput
            value={transport.authPrefix}
            placeholder="Bearer "
            onChange={(event) => patch('authPrefix', event.target.value)}
            onBlur={() => void store.persist()}
          />
        </Field>
      </div>

      <Field label="Header thêm (JSON)" hint='ví dụ {"x-title": "eu1444"}'>
        <textarea
          rows={2}
          value={transport.extraHeaders}
          placeholder="{}"
          onChange={(event) => patch('extraHeaders', event.target.value)}
          onBlur={() => void store.persist()}
          className="w-full resize-y rounded border border-oak-light bg-ink px-2 py-1.5 font-mono text-xs text-parchment"
        />
      </Field>
      <Field label="Thân thêm (JSON)" hint="gộp vào body và GHI ĐÈ mọi trường trùng tên">
        <textarea
          rows={2}
          value={transport.extraBody}
          placeholder="{}"
          onChange={(event) => patch('extraBody', event.target.value)}
          onBlur={() => void store.persist()}
          className="w-full resize-y rounded border border-oak-light bg-ink px-2 py-1.5 font-mono text-xs text-parchment"
        />
      </Field>
    </details>
  );
}

export function ConnectionTab({ profile }: { profile: ProfileId }): ReactNode {
  const cfg = useSettingsStore((state) => state.profiles[profile]);
  const runtime = useSettingsStore((state) => state.runtime[profile]);
  const useDevProxy = useSettingsStore((state) => state.useDevProxy);
  const preset = useSettingsStore((state) => state.preset);
  const store = useSettingsStore.getState();

  const [filter, setFilter] = useState('');
  const [manual, setManual] = useState('');
  const [checking, setChecking] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  /** Đã thử những đường dẫn nào — chỉ có ở provider `custom`. */
  const [probeLog, setProbeLog] = useState<string[] | null>(null);
  const inflight = useRef<AbortController | null>(null);

  const provider = getProvider(cfg.providerId);
  const warnings = useMemo(
    () => provider.warnings(cfg.params, cfg.model),
    [provider, cfg.params, cfg.model],
  );
  const removed = useMemo(
    () => provider.sanitizeParams(cfg.params, cfg.model).removed,
    [provider, cfg.params, cfg.model],
  );

  const models = runtime.models.filter((model) =>
    filter === '' ? true : model.id.toLowerCase().includes(filter.toLowerCase()),
  );
  const chosen = limitsFor(runtime.models, cfg.model);

  /**
   * Nút "Dừng" của Phần 1 mục 8.
   *
   * Timeout mặc định là 120 giây; không có đường hủy thì một proxy treo sẽ khóa
   * người chơi lại đúng hai phút trong khi họ đã biết thừa là nó hỏng.
   */
  const abort = (): void => {
    inflight.current?.abort();
    inflight.current = null;
    store.setScanning(profile, false);
    setChecking(false);
  };

  const scan = async (): Promise<void> => {
    setScanError(null);
    setProbeLog(null);
    store.setScanning(profile, true);
    inflight.current = new AbortController();
    try {
      let found;
      if (cfg.providerId === 'custom') {
        // Provider `custom` dò ra đường dẫn nào chạy được thì GHI LẠI ngay: mọi
        // lần gọi sau đi thẳng, không ai phải trả tiền cho việc dò hai lần.
        const probe = await probeCustomTransport(effectiveConfig(profile), inflight.current.signal);
        store.setCustomTransport(profile, probe.transport);
        setProbeLog(probe.log);
        found = probe.models;
      } else {
        found = await getProvider(cfg.providerId).listModels(
          effectiveConfig(profile),
          inflight.current.signal,
        );
      }
      store.setModels(profile, found);
      if (found.length > 0 && cfg.model === '') {
        store.patchProfile(profile, { model: found[0]?.id ?? '' });
      }
    } catch (error) {
      store.setScanning(profile, false);
      setScanError(error instanceof LlmError ? `${error.vi}${error.status === undefined ? '' : ` (HTTP ${error.status})`}\n${error.detail ?? ''}`.trim() : String(error));
    }
    inflight.current = null;
    await store.persist();
  };

  const test = async (): Promise<void> => {
    setChecking(true);
    inflight.current = new AbortController();
    const result = await checkConnection(effectiveConfig(profile), inflight.current.signal);
    store.setLastCheck(profile, {
      ok: result.ok,
      latencyMs: result.latencyMs,
      message: result.ok
        ? `Nhận được: "${result.sample ?? ''}"`
        : `${result.error?.vi ?? 'Lỗi'}${result.error?.status === undefined ? '' : ` (HTTP ${result.error.status})`}`,
    });
    inflight.current = null;
    setChecking(false);
  };

  /** Gõ tay một model mà lần quét không trả về — proxy nào cũng có vài cái như thế. */
  const addManual = (): void => {
    const id = manual.trim();
    if (id === '') return;
    if (!runtime.models.some((model) => model.id === id)) {
      store.setModels(profile, [...runtime.models, { id, label: `${id} (gõ tay)` }]);
    }
    store.patchProfile(profile, { model: id });
    setManual('');
    void store.persist();
  };

  return (
    <div className="flex flex-col gap-3">
      {profile === 'variables' && (
        <Warning level="info">
          Hồ sơ này chỉ chạy vòng cập nhật và sửa khối &lt;UpdateVariable&gt; — việc ngắn và máy móc,
          nên một model rẻ là đủ. ĐỂ TRỐNG thì engine dùng lại "Kết nối chính".
        </Warning>
      )}
      {profile === 'worldtick' && (
        <Warning level="info">
          Để trống thì mô phỏng ngầm chạy hoàn toàn bằng engine — vẫn hợp lệ, chỉ kém bất ngờ hơn.
        </Warning>
      )}

      <Field label="Chuẩn API">
        <Select
          value={cfg.providerId}
          onChange={(event) => {
            store.setProvider(profile, event.target.value as ProviderId);
            void store.persist();
          }}
        >
          {allProviders().map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Base URL" hint={useDevProxy ? `Đang gọi qua ${DEV_PROXY_PREFIX} của dev server.` : undefined}>
        <TextInput
          value={cfg.baseUrl}
          placeholder="https://proxy-cua-ban.example.com/v1"
          onChange={(event) => store.patchProfile(profile, { baseUrl: event.target.value })}
          onBlur={() => void store.persist()}
        />
      </Field>

      <Field label="Mật khẩu proxy" hint={PASSWORD_WARNING}>
        <PasswordInput
          value={cfg.password}
          onChange={(password) => store.patchProfile(profile, { password })}
        />
      </Field>

      {cfg.providerId === 'custom' && <CustomTransportFields profile={profile} />}

      <label className="flex items-center gap-2 text-sm text-vellum/70">
        <input
          type="checkbox"
          checked={cfg.stream !== false}
          onChange={(event) => {
            store.patchProfile(profile, { stream: event.target.checked });
            void store.persist();
          }}
        />
        Streaming (nhận chữ dần từng đoạn)
      </label>
      {cfg.stream === false && (
        <Warning level="info">
          Tắt streaming: engine gửi một request thường và chờ trọn câu trả lời. Chậm hơn về cảm giác,
          nhưng chạy được với proxy chặn SSE.
        </Warning>
      )}

      <label className="flex items-center gap-2 text-sm text-vellum/70">
        <input
          type="checkbox"
          checked={useDevProxy}
          onChange={(event) => {
            store.setUseDevProxy(event.target.checked);
            void store.persist();
          }}
        />
        Dùng proxy của dev server (tránh CORS lúc phát triển)
      </label>

      <div className="flex gap-2">
        <Button onClick={() => void scan()} disabled={runtime.scanning || cfg.baseUrl === ''}>
          {runtime.scanning ? 'Đang quét…' : 'Quét model'}
        </Button>
        <Button variant="primary" onClick={() => void test()} disabled={checking || cfg.model === ''}>
          {checking ? 'Đang thử…' : 'Kiểm tra kết nối'}
        </Button>
        <Button variant="danger" onClick={abort} disabled={!runtime.scanning && !checking}>
          Dừng
        </Button>
      </div>

      {scanError !== null && (
        <Warning level="warn">
          <span className="block whitespace-pre-wrap">{scanError}</span>
        </Warning>
      )}

      {probeLog !== null && probeLog.length > 0 && (
        <details className="rounded border border-oak-light bg-ink/60 p-2">
          <summary className="cursor-pointer text-xs text-brass">Đã dò những đường dẫn nào</summary>
          <pre className="mt-1 text-[11px] whitespace-pre-wrap text-vellum/70">{probeLog.join('\n')}</pre>
        </details>
      )}

      {runtime.models.length > 0 && (
        <>
          <Field label={`Lọc model (${models.length}/${runtime.models.length})`}>
            <TextInput value={filter} placeholder="gõ để tìm…" onChange={(event) => setFilter(event.target.value)} />
          </Field>
          <Field label="Model">
            <Select
              value={cfg.model}
              onChange={(event) => {
                store.patchProfile(profile, { model: event.target.value });
                void store.persist();
              }}
            >
              <option value="">— chọn model —</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label ?? model.id}
                  {model.contextWindow === undefined ? '' : ` · vào ${Math.round(model.contextWindow / 1000)}k`}
                  {model.maxOutput === undefined ? '' : ` · ra ${Math.round(model.maxOutput / 1000)}k`}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}

      {/*
        Quét model hỏng, hoặc proxy không có `GET /models` nào cả, KHÔNG được là
        ngõ cụt: gõ thẳng tên model vào là xong.
      */}
      <Field label="Hoặc gõ tay tên model" hint="dùng khi proxy không có endpoint quét model">
        <div className="flex gap-1">
          <TextInput
            value={manual}
            placeholder="ví dụ gemini-3-pro"
            onChange={(event) => setManual(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addManual();
            }}
          />
          <Button onClick={addManual} disabled={manual.trim() === ''}>
            Dùng
          </Button>
        </div>
      </Field>

      {cfg.model !== '' && (
        <p className="text-xs text-vellum/50">
          Model đang dùng: <b className="text-vellum/80">{cfg.model}</b>
          {chosen?.contextWindow === undefined ? '' : ` · cửa sổ ngữ cảnh ${chosen.contextWindow.toLocaleString('vi-VN')}`}
          {chosen?.maxOutput === undefined ? '' : ` · trần đầu ra ${chosen.maxOutput.toLocaleString('vi-VN')}`}
        </p>
      )}

      {runtime.lastCheck !== null && (
        <Warning level={runtime.lastCheck.ok ? 'info' : 'warn'}>
          {runtime.lastCheck.ok ? '✓' : '✗'} {runtime.lastCheck.message} — {runtime.lastCheck.latencyMs}ms
        </Warning>
      )}

      <TokenLimits profile={profile} model={chosen} />

      <Field label="Timeout (ms)">
        <TextInput
          type="number"
          min={1000}
          max={600000}
          step={1000}
          value={cfg.timeoutMs}
          onChange={(event) => store.patchProfile(profile, { timeoutMs: Number(event.target.value) })}
          onBlur={() => void store.persist()}
        />
      </Field>

      <div className="mt-2 border-t border-oak-light pt-3">
        <p className="mb-2 text-xs tracking-[0.2em] text-brass uppercase">Tham số</p>
        <div className="flex flex-col gap-3">
          {provider.paramSpecs.map((spec) => (
            <ParamControl key={spec.key} profile={profile} spec={spec} model={chosen} />
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-1">
          {[...warnings, ...removed].map((warning, index) => (
            <Warning key={`${warning.key}-${index}`} level={warning.level}>
              {warning.message}
            </Warning>
          ))}
        </div>
      </div>

      {preset !== null && (
        <Button
          onClick={() => {
            store.applyPresetTuning(profile);
            void store.persist();
          }}
        >
          Áp tham số của preset "{preset.name}" vào hồ sơ này
        </Button>
      )}

      {profile !== 'main' && (
        <Button
          onClick={() => {
            store.copyProfile('main', profile);
            void store.persist();
          }}
        >
          Sao chép cấu hình từ {PROFILE_LABELS.main}
        </Button>
      )}
    </div>
  );
}
