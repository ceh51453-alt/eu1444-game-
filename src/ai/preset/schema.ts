/**
 * Zod schema cho định dạng preset Chat Completion của SillyTavern (mục 6.1).
 *
 * Mọi object đều `.loose()`: preset thật luôn có thêm trường mà tài liệu không
 * liệt kê, và chúng phải sống sót qua vòng import → export. Vứt trường lạ đi
 * là làm hỏng preset của người chơi.
 *
 * Gần như mọi trường đều optional. File mẫu ngoài đời thiếu trường là chuyện
 * bình thường, và R4 nói sai schema thì từ chối chứ không được crash — nên
 * chỗ nào có thể khoan dung thì khoan dung, chỗ nào là cấu trúc thì siết.
 */

import { z } from 'zod';

export const promptEntrySchema = z
  .object({
    /** KHÓA THẬT, dùng để nối với prompt_order. */
    identifier: z.string(),
    /** Thường trùng identifier NHƯNG KHÔNG PHẢI LÚC NÀO CŨNG — bỏ qua nó. */
    id: z.string().optional(),
    name: z.string().optional(),
    /** KHÔNG ĐÁNG TIN — prompt_order mới là nguồn sự thật (cái bẫy số 1). */
    enabled: z.boolean().optional(),
    role: z.enum(['system', 'user', 'assistant']).optional(),
    content: z.string().optional(),
    system_prompt: z.boolean().optional(),
    /** true = ô cắm dựng sẵn, content rỗng. */
    marker: z.boolean().optional(),
    forbid_overrides: z.boolean().optional(),
    /** 0 = xếp theo thứ tự, 1 = chèn theo độ sâu. */
    injection_position: z.union([z.literal(0), z.literal(1)]).optional(),
    injection_depth: z.number().int().optional(),
    injection_order: z.number().int().optional(),
    injection_trigger: z.array(z.string()).optional(),
  })
  .loose();

export type PromptEntry = z.infer<typeof promptEntrySchema>;

export const promptOrderEntrySchema = z
  .object({
    identifier: z.string(),
    enabled: z.boolean().optional(),
  })
  .loose();

export const promptOrderSchema = z
  .object({
    character_id: z.number(),
    order: z.array(promptOrderEntrySchema),
  })
  .loose();

export const regexScriptSchema = z
  .object({
    id: z.string().optional(),
    scriptName: z.string().optional(),
    disabled: z.boolean().optional(),
    runOnEdit: z.boolean().optional(),
    findRegex: z.string(),
    replaceString: z.string().optional(),
    trimStrings: z.array(z.string()).optional(),
    /** 1 = tin nhắn người dùng, 2 = tin nhắn AI, 3 = lệnh, 5 = lorebook. */
    placement: z.array(z.number().int()).optional(),
    substituteRegex: z.union([z.boolean(), z.number()]).optional(),
    minDepth: z.number().int().nullable().optional(),
    maxDepth: z.number().int().nullable().optional(),
    markdownOnly: z.boolean().optional(),
    promptOnly: z.boolean().optional(),
  })
  .loose();

export type RegexScriptRaw = z.infer<typeof regexScriptSchema>;

export const tavernHelperScriptSchema = z
  .object({
    type: z.string().optional(),
    enabled: z.boolean().optional(),
    name: z.string().optional(),
    id: z.string().optional(),
    content: z.string(),
    /** Cờ khai báo tay: script này phải chạy trên luồng chính (mục 6.8). */
    runsOnMainThread: z.boolean().optional(),
  })
  .loose();

export type TavernHelperScriptRaw = z.infer<typeof tavernHelperScriptSchema>;

/**
 * `RegexBinding` KHÔNG phải mảng.
 *
 * Trên cả ba preset thật, nó là `{ regexes: [...] }`. Khai báo nó là mảng làm
 * Zod từ chối TOÀN BỘ file — đúng kiểu lỗi mà preset tự dựng không bao giờ lộ
 * ra. Vẫn chấp nhận dạng mảng trần phòng khi có bản ST khác ghi kiểu đó.
 */
export const regexBindingSchema = z.union([
  z.object({ regexes: z.array(regexScriptSchema) }).loose(),
  z.array(regexScriptSchema),
]);

/** Lấy danh sách regex ra khỏi cả hai dạng. */
export function regexesOf(binding: z.infer<typeof regexBindingSchema> | undefined): RegexScriptRaw[] {
  if (binding === undefined) return [];
  return Array.isArray(binding) ? binding : binding.regexes;
}

export const extensionsSchema = z
  .object({
    SPreset: z
      .object({
        ChatSquash: z.unknown().optional(),
        MacroNest: z.unknown().optional(),
        RegexBinding: regexBindingSchema.optional(),
        ToolBindings: z.unknown().optional(),
      })
      .loose()
      .optional(),
    regex_scripts: z.array(regexScriptSchema).optional(),
    tavern_helper: z
      .object({ scripts: z.array(tavernHelperScriptSchema).optional() })
      .loose()
      .optional(),
    entryGrouping: z.unknown().optional(),
  })
  .loose();

export const sillyTavernPresetSchema = z
  .object({
    // --- tham số sampler, phẳng ở cấp cao nhất ---
    temperature: z.number().optional(),
    frequency_penalty: z.number().optional(),
    presence_penalty: z.number().optional(),
    top_p: z.number().optional(),
    top_k: z.number().optional(),
    top_a: z.number().optional(),
    min_p: z.number().optional(),
    repetition_penalty: z.number().optional(),
    openai_max_context: z.number().optional(),
    openai_max_tokens: z.number().optional(),
    max_context_unlocked: z.boolean().optional(),
    seed: z.number().optional(),
    n: z.number().optional(),
    stream_openai: z.boolean().optional(),

    // --- tham số suy luận / hành vi ---
    tool_reasoning_mode: z.string().optional(),
    reasoning_effort: z.string().optional(),
    verbosity: z.string().optional(),
    show_thoughts: z.boolean().optional(),
    function_calling: z.boolean().optional(),
    tool_call_recurse_limit: z.number().int().optional(),
    enable_web_search: z.boolean().optional(),

    // --- định dạng ghép prompt ---
    names_behavior: z.number().int().optional(),
    send_if_empty: z.string().optional(),
    wi_format: z.string().optional(),
    scenario_format: z.string().optional(),
    personality_format: z.string().optional(),
    group_nudge_prompt: z.string().optional(),
    impersonation_prompt: z.string().optional(),
    new_chat_prompt: z.string().optional(),
    new_group_chat_prompt: z.string().optional(),
    new_example_chat_prompt: z.string().optional(),
    continue_nudge_prompt: z.string().optional(),
    bias_preset_selected: z.string().optional(),
    use_sysprompt: z.boolean().optional(),
    squash_system_messages: z.boolean().optional(),
    assistant_prefill: z.string().optional(),
    assistant_impersonation: z.string().optional(),
    continue_prefill: z.boolean().optional(),
    continue_postfix: z.string().optional(),

    // --- ảnh ---
    media_inlining: z.boolean().optional(),
    inline_image_quality: z.string().optional(),
    request_images: z.boolean().optional(),
    request_image_aspect_ratio: z.string().optional(),
    request_image_resolution: z.string().optional(),
    image_inlining: z.boolean().optional(),
    video_inlining: z.boolean().optional(),
    wrap_in_quotes: z.boolean().optional(),

    prompts: z.array(promptEntrySchema).optional(),
    prompt_order: z.array(promptOrderSchema).optional(),
    extensions: extensionsSchema.optional(),
  })
  .loose();

export type SillyTavernPreset = z.infer<typeof sillyTavernPresetSchema>;

/** prompt_order theo character_id mặc định toàn cục (cái bẫy số 4). */
export const GLOBAL_CHARACTER_ID = 100001;
